/**
 * Semgrep 静态分析服务
 *
 * 在 LLM 分析前运行，用 AST 模式匹配检测确定性问题，
 * 命中的直接生成 issue（source: "semgrep", confidence: 1.0），
 * LLM 不再重复检查已覆盖的类别。
 */

import { execSync } from "child_process";
import type { Issue, IssueCategory } from "@/backend/types";

// Semgrep 规则 ID → IssueCategory 映射
const RULE_CATEGORY_MAP: Record<string, IssueCategory> = {
  "xss-innerhtml": "XSS",
  "xss-dangerously-setinnerhtml": "XSS",
  "sql-injection-raw-query": "SQL_INJECTION",
  "hardcoded-secret": "INFO_LEAK",
  "unsafe-dynamic-eval": "CODE_QUALITY",
};

// IssueCategory → Layer 映射
const CATEGORY_LAYER: Record<string, string> = {
  XSS: "frontend",
  SQL_INJECTION: "backend",
  INFO_LEAK: "backend",
  CODE_QUALITY: "backend",
  INJECTION: "backend",
};

interface SemgrepFinding {
  check_id: string;
  path: string;
  start: { line: number; col: number };
  end: { line: number; col: number };
  extra: {
    message: string;
    severity: string;
    lines: string;
    metadata?: { category?: string };
  };
}

interface SemgrepOutput {
  results: SemgrepFinding[];
  errors: unknown[];
}

/**
 * 对指定文件列表运行 Semgrep，返回 Issue 数组
 */
export function runSemgrepScan(files: string[]): Issue[] {
  if (files.length === 0) return [];

  const issues: Issue[] = [];

  try {
    const raw = execSync(`npx semgrep --config .semgrep.yml --json`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 30000,
    });

    const output: SemgrepOutput = JSON.parse(raw);
    if (output.errors.length > 0) {
      console.warn("[Semgrep] 部分规则执行出错:", output.errors.length);
    }

    for (const finding of output.results) {
      // 仅保留指定文件列表中的结果
      if (!files.some((f) => finding.path.endsWith(f) || finding.path.includes(f))) {
        continue;
      }

      const category = RULE_CATEGORY_MAP[finding.check_id] || "CODE_QUALITY";
      const layer = (CATEGORY_LAYER[category] || "backend") as Issue["layer"];
      const severity = finding.extra.severity === "ERROR" ? "HIGH" : "MEDIUM";

      issues.push({
        id: `semgrep-${finding.check_id}-${finding.path}:${finding.start.line}`,
        filePath: finding.path,
        lineStart: finding.start.line,
        lineEnd: finding.end.line,
        layer,
        severity,
        category,
        title: finding.check_id.replace(/-/g, " "),
        description: finding.extra.message.trim(),
        codeSnippet: finding.extra.lines,
        confidence: 1.0,
        source: "semgrep",
        ruleId: finding.check_id,
      });
    }

    console.log(`[Semgrep] 扫描完成，发现 ${issues.length} 个确定性问题`);
  } catch (err) {
    // Semgrep 未安装或执行失败时降级，不阻塞主流程
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Semgrep] 扫描跳过 (${msg.slice(0, 100)})`);
  }

  return issues;
}

/**
 * 获取 Semgrep 已覆盖的类别集合（用于通知 LLM 跳过）
 */
export function getSemgrepCoveredCategories(issues: Issue[]): string[] {
  const categories = new Set<string>();
  for (const i of issues) {
    categories.add(i.category);
  }
  return Array.from(categories);
}

/**
 * 生成 LLM prompt 中的"已由静态分析覆盖"提示
 */
export function buildSemgrepPromptHint(coveredCats: string[]): string {
  if (coveredCats.length === 0) return "";

  return [
    "",
    "## 静态分析已覆盖（以下维度无需再检查）",
    `Semgrep 已检出以下类别的问题，请跳过这些维度，专注其他需要推理的安全和逻辑问题：`,
    coveredCats.map((c) => `- ${c}`).join("\n"),
  ].join("\n");
}

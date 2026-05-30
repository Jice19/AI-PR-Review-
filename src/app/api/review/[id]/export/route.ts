import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/lib/session";
import { getReview } from "@/backend/services/review";
import type { Issue, Suggestion } from "@/backend/types";

const SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: "严重",
  HIGH: "高危",
  MEDIUM: "中危",
  LOW: "低危",
};

const DECISION_LABELS: Record<string, string> = {
  APPROVE: "建议通过",
  COMMENT: "建议评论",
  REQUEST_CHANGES: "需要修改",
};

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    sql: "sql",
    yaml: "yaml",
    yml: "yaml",
    json: "json",
    html: "html",
    css: "css",
    scss: "scss",
    sh: "bash",
    dockerfile: "dockerfile",
    md: "markdown",
  };
  return map[ext] || ext || "text";
}

function formatSuggestion(suggestion: Suggestion, language: string): string {
  const parts: string[] = [];

  parts.push("**修复建议**:\n");
  parts.push(`- **修复类型**: ${suggestion.fixType}`);
  parts.push(`- **描述**: ${suggestion.description}`);

  if (suggestion.codeBefore) {
    parts.push(`\n- **修复前**:\n`);
    parts.push(`\`\`\`${language}`);
    parts.push(suggestion.codeBefore);
    parts.push("```");
  }

  if (suggestion.codeAfter) {
    parts.push(`\n- **修复后**:\n`);
    parts.push(`\`\`\`${language}`);
    parts.push(suggestion.codeAfter);
    parts.push("```");
  }

  if (suggestion.securityRationale) {
    parts.push(`\n- **安全性说明**: ${suggestion.securityRationale}`);
  }

  if (suggestion.performanceImpact) {
    parts.push(`\n- **性能影响**: ${suggestion.performanceImpact}`);
  }

  if (suggestion.rollback) {
    parts.push(`\n- **回滚方案**: ${suggestion.rollback}`);
  }

  if (suggestion.alternatives && suggestion.alternatives.length > 0) {
    parts.push(`\n- **备选方案**:`);
    for (const alt of suggestion.alternatives) {
      parts.push(`  - **${alt.approach}**:\n    \`\`\`${language}\n    ${alt.code}\n    \`\`\``);
    }
  }

  return parts.join("\n");
}

function groupIssuesBySeverity(issues: Issue[]) {
  const groups: Record<string, Issue[]> = {};
  for (const issue of issues) {
    const sev = issue.severity || "LOW";
    if (!groups[sev]) groups[sev] = [];
    groups[sev].push(issue);
  }
  return SEVERITY_ORDER.filter((s) => groups[s]).map((s) => ({ severity: s, issues: groups[s] }));
}

function buildMarkdown(review: Awaited<ReturnType<typeof getReview>>): string {
  if (!review) return "";

  const decisionLabel = DECISION_LABELS[review.decision || ""] || review.decision || "N/A";
  const dateStr = new Date(review.createdAt).toISOString().replace("T", " ").slice(0, 19);

  const lines: string[] = [];

  // Title
  lines.push(`# PR Review Report: ${review.prTitle}`);
  lines.push("");

  // Metadata table
  lines.push("## Metadata");
  lines.push("");
  lines.push("| 字段 | 值 |");
  lines.push("|------|-----|");
  lines.push(`| PR URL | ${review.prUrl} |`);
  lines.push(`| Repository | ${review.repoName} |`);
  lines.push(`| Branch | \`${review.branchFrom}\` → \`${review.branchTo}\` |`);
  lines.push(`| Review Date | ${dateStr} |`);
  lines.push(`| Overall Score | ${review.overallScore ?? "N/A"}/100 |`);
  lines.push(`| Decision | ${decisionLabel} |`);
  if (review.decisionReason) {
    lines.push(`| Decision Reason | ${review.decisionReason} |`);
  }
  lines.push("");

  // Summary
  lines.push("## 变更总结");
  lines.push("");
  if (review.summary) {
    // summary is already in markdown format
    lines.push(review.summary);
  } else {
    lines.push("_(暂无总结)_");
  }
  lines.push("");

  // Score + Decision
  lines.push(`## 综合评分: ${review.overallScore ?? "N/A"}/100`);
  lines.push("");
  lines.push(`**Decision**: ${decisionLabel}${review.decisionReason ? ` — ${review.decisionReason}` : ""}`);
  lines.push("");

  // Issues by severity
  const groups = groupIssuesBySeverity(review.issues as unknown as Issue[]);
  const totalIssues = groups.reduce((sum, g) => sum + g.issues.length, 0);

  lines.push("## 问题列表");
  lines.push("");

  if (totalIssues === 0) {
    lines.push("未发现问题，代码质量良好");
    lines.push("");
  } else {
    let globalIndex = 0;
    for (const { severity, issues } of groups) {
      const label = SEVERITY_LABELS[severity] || severity;
      lines.push(`### ${severity} — ${label} (${issues.length} 个)`);
      lines.push("");

      for (const issue of issues) {
        globalIndex++;
        const lang = detectLanguage(issue.filePath);

        lines.push(`#### ${globalIndex}. ${issue.title} — \`${issue.filePath}:${issue.lineStart}\``);
        lines.push("");
        lines.push(`- **分类**: ${issue.category}`);
        lines.push(`- **层级**: ${issue.layer}`);
        lines.push(`- **置信度**: ${Math.round(issue.confidence * 100)}%`);
        lines.push(`- **严重程度**: ${severity}`);
        lines.push(`- **描述**: ${issue.description}`);
        lines.push("");

        if (issue.codeSnippet) {
          lines.push("**问题代码**:");
          lines.push("");
          lines.push(`\`\`\`${lang}`);
          lines.push(issue.codeSnippet);
          lines.push("```");
          lines.push("");
        }

        const suggestion = issue.suggestion as Suggestion | null;
        if (suggestion) {
          lines.push(formatSuggestion(suggestion, lang));
          lines.push("");
        }

        const rawIssue = issue as unknown as Record<string, unknown>;
        const feedbacks = rawIssue.feedbacks as unknown[] | undefined;
        if (feedbacks && feedbacks.length > 0) {
          const fb = feedbacks[0] as { feedback?: string } | undefined;
          if (fb?.feedback) {
            lines.push(`- **用户反馈**: ${fb.feedback}`);
            lines.push("");
          }
        }
      }
    }
  }

  // Priority suggestions
  if (totalIssues > 0) {
    lines.push("## 修复优先级建议");
    lines.push("");
    let priority = 0;
    for (const { severity, issues } of groups) {
      for (const issue of issues) {
        priority++;
        lines.push(`${priority}. **[${severity}]** ${issue.title} — \`${issue.filePath}:${issue.lineStart}\``);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const review = await getReview(params.id);
    if (!review) {
      return NextResponse.json({ error: "Review 不存在" }, { status: 404 });
    }

    if (review.userId !== session.user.id) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    if (review.status !== "COMPLETED") {
      return NextResponse.json({ error: "Review 尚未完成，无法导出" }, { status: 400 });
    }

    const markdown = buildMarkdown(review);
    const shortId = review.id.slice(0, 8);

    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="pr-review-${shortId}.md"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    console.error("导出 Review 失败:", error);
    return NextResponse.json({ error: "导出失败" }, { status: 500 });
  }
}

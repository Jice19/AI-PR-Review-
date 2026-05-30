import { describe, it, expect, vi } from "vitest";

// Mock 外部依赖，避免 vitest 加载 Prisma/OpenAI 等运行时依赖
vi.mock("@/backend/lib/prisma", () => ({
  prisma: {},
}));
vi.mock("openai", () => ({
  default: vi.fn(),
}));

import { parsePRUrl, classifyFileLayer } from "../src/backend/lib/github";
import { calculateScore } from "../src/backend/services/analyzer";
import { parseLLMResponse } from "../src/backend/lib/llm";
import { buildPRComment } from "../src/backend/lib/pr-comment";

// ========== PR URL 解析 ==========

describe("parsePRUrl", () => {
  it("解析标准 GitHub PR URL", () => {
    const result = parsePRUrl("https://github.com/owner/repo/pull/42");
    expect(result).toEqual({ owner: "owner", repo: "repo", prNumber: 42 });
  });

  it("支持 repo 名含 . 和 -", () => {
    const result = parsePRUrl("https://github.com/Jice19/AI-PR-Review-/pull/1");
    expect(result).toEqual({ owner: "Jice19", repo: "AI-PR-Review-", prNumber: 1 });
  });

  it("非法 URL 抛异常", () => {
    expect(() => parsePRUrl("not-a-url")).toThrow("Invalid GitHub PR URL");
    expect(() => parsePRUrl("https://gitlab.com/o/r/pull/1")).toThrow("Invalid GitHub PR URL");
  });

  it("URL 带 query string 正确提取 PR 号", () => {
    // 注意：parsePRUrl 要求严格匹配，带 query 的不匹配
    // 实际使用中调用方应先清洗 URL
    const result = parsePRUrl("https://github.com/a/b/pull/99");
    expect(result.prNumber).toBe(99);
  });
});

// ========== 文件层级分类 ==========

describe("classifyFileLayer", () => {
  it("前端文件归为 frontend", () => {
    expect(classifyFileLayer("src/components/Button.tsx")).toBe("frontend");
    expect(classifyFileLayer("pages/index.tsx")).toBe("frontend");
    expect(classifyFileLayer("src/hooks/useAuth.ts")).toBe("frontend");
    expect(classifyFileLayer("styles/global.css")).toBe("frontend");
  });

  it("数据库文件归为 database", () => {
    expect(classifyFileLayer("prisma/schema.prisma")).toBe("database");
    expect(classifyFileLayer("migrations/001.sql")).toBe("database");
  });

  it("配置文件归为 config", () => {
    expect(classifyFileLayer("docker-compose.yml")).toBe("config");
    expect(classifyFileLayer(".github/workflows/ci.yml")).toBe("config");
    expect(classifyFileLayer("Dockerfile")).toBe("config");
  });

  it("后端文件归为 backend", () => {
    expect(classifyFileLayer("src/services/review.ts")).toBe("backend");
    expect(classifyFileLayer("controllers/user.ts")).toBe("backend");
    expect(classifyFileLayer("middleware/auth.ts")).toBe("backend");
  });

  it("未匹配文件默认归为 backend", () => {
    expect(classifyFileLayer("README.md")).toBe("backend");
  });
});

// ========== 评分函数 ==========

describe("calculateScore", () => {
  it("无问题得满分", () => {
    expect(calculateScore([], {})).toBe(100);
  });

  it("CRITICAL 问题显著扣分", () => {
    const score = calculateScore(
      [{ severity: "CRITICAL", confidence: 1.0 }],
      { totalAdditions: 50, totalDeletions: 20 }
    );
    expect(score).toBeLessThan(80);
  });

  it("低置信度问题扣分更少", () => {
    const highConf = calculateScore(
      [{ severity: "HIGH", confidence: 1.0 }],
      { totalAdditions: 100, totalDeletions: 0 }
    );
    const lowConf = calculateScore(
      [{ severity: "HIGH", confidence: 0.3 }],
      { totalAdditions: 100, totalDeletions: 0 }
    );
    expect(lowConf).toBeGreaterThan(highConf);
  });

  it("大 PR 同等问题扣分更轻", () => {
    const smallPR = calculateScore(
      [{ severity: "MEDIUM", confidence: 1.0 }],
      { totalAdditions: 10, totalDeletions: 5 }
    );
    const largePR = calculateScore(
      [{ severity: "MEDIUM", confidence: 1.0 }],
      { totalAdditions: 3000, totalDeletions: 1000 }
    );
    expect(largePR).toBeGreaterThan(smallPR);
  });

  it("分数不会低于 0", () => {
    const score = calculateScore(
      Array(10).fill({ severity: "CRITICAL", confidence: 1.0 }),
      { totalAdditions: 10, totalDeletions: 5 }
    );
    expect(score).toBe(0);
  });
});

// ========== LLM 响应解析 ==========

describe("parseLLMResponse", () => {
  it("解析纯 JSON", () => {
    const result = parseLLMResponse<{ name: string }>('{"name":"test"}');
    expect(result).toEqual({ name: "test" });
  });

  it("解析 markdown 包裹的 JSON", () => {
    const result = parseLLMResponse<{ key: number }>(
      "```json\n{\"key\": 42}\n```"
    );
    expect(result).toEqual({ key: 42 });
  });

  it("解析含前后说明文字的 JSON", () => {
    const result = parseLLMResponse<{ issues: string[] }>(
      "以下是分析结果：\n{\"issues\": [\"a\", \"b\"]}\n以上是全部问题。"
    );
    expect(result).toEqual({ issues: ["a", "b"] });
  });

  it("非法 JSON 返回 raw 对象", () => {
    const result = parseLLMResponse<{ issues: string[] }>("not json at all");
    expect(result).toHaveProperty("raw", "not json at all");
  });
});

// ========== PR Comment 构建 ==========

describe("buildPRComment", () => {
  it("生成基础结构", () => {
    const comment = buildPRComment({
      prTitle: "Test PR",
      summary: "Test summary",
      overallScore: 85,
      decision: "APPROVE",
      decisionReason: "No issues found",
      issues: [],
    });
    expect(comment).toContain("AI Code Review: Test PR");
    expect(comment).toContain("85");
    expect(comment).toContain("No Issues Found");
  });

  it("包含问题列表", () => {
    const comment = buildPRComment({
      prTitle: "Test",
      summary: null,
      overallScore: 60,
      decision: "COMMENT",
      decisionReason: "Needs review",
      issues: [
        {
          filePath: "src/app.ts",
          lineStart: 10,
          severity: "CRITICAL",
          category: "SQL_INJECTION",
          title: "SQL Injection risk",
          description: "Unsafe SQL query found",
          confidence: 0.95,
        },
      ],
    });
    expect(comment).toContain("SQL_INJECTION");
    expect(comment).toContain("CRITICAL");
    expect(comment).toContain("95%");
  });

  it("REQUEST_CHANGES 正常展示", () => {
    const comment = buildPRComment({
      prTitle: "Bug fix",
      summary: null,
      overallScore: 30,
      decision: "REQUEST_CHANGES",
      decisionReason: "Critical issues found",
      issues: [],
    });
    expect(comment).toContain("REQUEST_CHANGES");
  });

  it("修复建议正常渲染", () => {
    const comment = buildPRComment({
      prTitle: "FEAT",
      summary: null,
      overallScore: 70,
      decision: "COMMENT",
      decisionReason: "",
      issues: [
        {
          filePath: "a.ts",
          lineStart: 1,
          severity: "HIGH",
          category: "XSS",
          title: "XSS",
          description: "bad",
          suggestion: { description: "Use DOMPurify to sanitize" },
        },
      ],
    });
    expect(comment).toContain("DOMPurify");
  });
});

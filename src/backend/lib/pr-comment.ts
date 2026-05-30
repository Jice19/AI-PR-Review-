/**
 * PR Comment 构建器 - 统一生成 AI Review 评论 Markdown
 *
 * 被 ci-review.ts 和 webhook/route.ts 共享使用，
 * 消除重复代码，确保两种触发方式的评论格式一致。
 */

interface CommentIssue {
  filePath: string;
  lineStart: number;
  severity: string;
  category: string;
  title: string;
  description: string;
  codeSnippet?: string;
  confidence?: number;
  suggestion?: { description?: string } | null;
}

interface CommentInput {
  prTitle: string;
  summary: string | null;
  overallScore: number | null;
  decision: string | null;
  decisionReason: string | null;
  issues: CommentIssue[];
  prUrl?: string;
}

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

const DECISION_EMOJI: Record<string, string> = {
  APPROVE: "✅",
  COMMENT: "💬",
  REQUEST_CHANGES: "❌",
};

export function buildPRComment(input: CommentInput): string {
  const { prTitle, summary, overallScore, decision, decisionReason, issues, prUrl } = input;
  const totalIssues = issues.length;
  const score = overallScore ?? null;

  // 按严重程度统计
  const countBySev: Record<string, number> = {};
  for (const i of issues) {
    countBySev[i.severity] = (countBySev[i.severity] || 0) + 1;
  }

  const decisionEmoji = DECISION_EMOJI[decision || ""] || "";
  const decisionLabel = decision || "N/A";

  const lines: string[] = [];

  // Header
  lines.push(`## ${decisionEmoji} AI Code Review: ${prTitle}`);
  lines.push("");

  // Score + Decision
  if (score !== null) {
    const scoreColor = score >= 80 ? "green" : score >= 60 ? "orange" : "red";
    lines.push(`| | |`);
    lines.push(`|---|---|`);
    lines.push(`| **Score** | ![](https://img.shields.io/badge/${score}%2F100-${scoreColor}) |`);
    lines.push(`| **Decision** | ${decisionEmoji} ${decisionLabel}${decisionReason ? ` — ${decisionReason}` : ""} |`);
    lines.push("");
  }

  // Issue summary
  if (totalIssues > 0) {
    lines.push(`### Issues Found: ${totalIssues}`);
    lines.push("");
    const parts: string[] = [];
    if (countBySev.CRITICAL) parts.push(`${countBySev.CRITICAL} critical`);
    if (countBySev.HIGH) parts.push(`${countBySev.HIGH} high`);
    if (countBySev.MEDIUM) parts.push(`${countBySev.MEDIUM} medium`);
    if (countBySev.LOW) parts.push(`${countBySev.LOW} low`);
    lines.push(`> ${parts.join(" · ")}`);
    lines.push("");

    // Issues by severity (collapsed)
    for (const sev of SEVERITY_ORDER) {
      const sevIssues = issues.filter((i) => i.severity === sev);
      if (sevIssues.length === 0) continue;

      lines.push(`<details>`);
      lines.push(`<summary><strong>${sev}</strong> (${sevIssues.length})</summary>`);
      lines.push("");

      for (const issue of sevIssues) {
        const suggestion = issue.suggestion;

        lines.push(`#### ${issue.title}`);
        lines.push(`- **File**: \`${issue.filePath}:${issue.lineStart}\``);
        lines.push(`- **Category**: ${issue.category}`);
        if (issue.confidence != null) {
          lines.push(`- **Confidence**: ${Math.round(issue.confidence * 100)}%`);
        }
        lines.push("");
        lines.push(issue.description);
        lines.push("");

        if (issue.codeSnippet) {
          lines.push("<details>");
          lines.push("<summary>Code</summary>");
          lines.push("");
          lines.push("```");
          lines.push(issue.codeSnippet.slice(0, 2000));
          lines.push("```");
          lines.push("");
          lines.push("</details>");
          lines.push("");
        }

        if (suggestion?.description) {
          lines.push(`> 💡 **Fix**: ${suggestion.description}`);
          lines.push("");
        }
      }

      lines.push("</details>");
      lines.push("");
    }
  } else {
    lines.push("### ✅ No Issues Found");
    lines.push("");
    lines.push("Code quality looks good, no issues were detected.");
    lines.push("");
  }

  // Summary excerpt
  if (summary) {
    lines.push("---");
    lines.push("");
    lines.push("<details>");
    lines.push("<summary>Full Summary</summary>");
    lines.push("");
    lines.push(summary.slice(0, 5000));
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  // Footer
  lines.push("---");
  if (prUrl) {
    lines.push(`*Automated review for ${prUrl}*`);
  } else {
    lines.push(`*Automated review by [AI PR Review Tool](https://github.com)*`);
  }

  return lines.join("\n");
}

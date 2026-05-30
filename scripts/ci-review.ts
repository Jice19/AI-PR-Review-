/**
 * CI Review Script
 *
 * 在 GitHub Actions 中运行，不依赖数据库、不依赖服务端。
 * 用法: npx tsx scripts/ci-review.ts <pr-url>
 *
 * 所需环境变量:
 *   GITHUB_TOKEN      - GitHub API token（Actions 自动注入）
 *   DEEPSEEK_API_KEY  - DeepSeek API key
 *   DATABASE_URL      - 设为任意值即可，Prisma 不会实际连接
 */

import { GitHubService } from "../src/backend/lib/github";
import { runFullAnalysis } from "../src/backend/services/analyzer";

const PR_URL = process.argv[2];

if (!PR_URL) {
  console.error("用法: npx tsx scripts/ci-review.ts <pr-url>");
  process.exit(1);
}

if (!process.env.GITHUB_TOKEN) {
  console.error("错误: 未设置 GITHUB_TOKEN");
  process.exit(1);
}

if (!process.env.DEEPSEEK_API_KEY) {
  console.error("错误: 未设置 DEEPSEEK_API_KEY");
  process.exit(1);
}

// ====== Markdown 评论构建 ======

const SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
};

function buildPRComment(result: Awaited<ReturnType<typeof runFullAnalysis>>, prUrl: string): string {
  const issues = result.issues || [];
  const totalIssues = issues.length;
  const score = result.overallScore ?? 0;

  const countBySev: Record<string, number> = {};
  for (const i of issues) {
    countBySev[i.severity] = (countBySev[i.severity] || 0) + 1;
  }

  const scoreColor = score >= 80 ? "success" : score >= 60 ? "orange" : "red";
  const lines: string[] = [];

  lines.push(`## 🤖 AI Code Review`);
  lines.push("");

  // Score badge
  lines.push(`![Score](https://img.shields.io/badge/Score-${score}%2F100-${scoreColor})`);
  lines.push(`**Decision**: ${result.decision} — ${result.decisionReason}`);
  lines.push("");

  // Issue counts
  if (totalIssues > 0) {
    const parts: string[] = [];
    if (countBySev.CRITICAL) parts.push(`${countBySev.CRITICAL} Critical`);
    if (countBySev.HIGH) parts.push(`${countBySev.HIGH} High`);
    if (countBySev.MEDIUM) parts.push(`${countBySev.MEDIUM} Medium`);
    if (countBySev.LOW) parts.push(`${countBySev.LOW} Low`);
    lines.push(`### Found ${totalIssues} Issues`);
    lines.push(`> ${parts.join(" · ")}`);
    lines.push("");
  } else {
    lines.push("### ✅ No Issues Found");
    lines.push("");
  }

  // Issues by severity (collapsed)
  const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  for (const sev of severityOrder) {
    const sevIssues = issues.filter((i: { severity: string }) => i.severity === sev);
    if (sevIssues.length === 0) continue;

    lines.push(`<details>`);
    lines.push(`<summary><strong>${SEVERITY_LABELS[sev]}</strong> (${sevIssues.length})</summary>`);
    lines.push("");

    for (const issue of sevIssues) {
      const suggestion = (issue as { suggestion?: { description?: string } }).suggestion;
      lines.push(`#### ${issue.title}`);
      lines.push(`- **File**: \`${issue.filePath}:${issue.lineStart}\``);
      lines.push(`- **Category**: ${issue.category}`);
      lines.push(`- **Confidence**: ${Math.round(issue.confidence * 100)}%`);
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

  // Summary
  if (result.summary) {
    lines.push("---");
    lines.push("");
    lines.push("<details>");
    lines.push("<summary>Full Summary</summary>");
    lines.push("");
    lines.push(result.summary.slice(0, 5000));
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  lines.push("---");
  lines.push(`*Automated review for ${prUrl}*`);

  return lines.join("\n");
}

// ====== Main ======

async function main() {
  console.log(`[CI-Review] PR URL: ${PR_URL}`);

  // 1. Fetch PR context
  console.log("[CI-Review] 获取 PR 代码上下文...");
  const github = new GitHubService();
  const context = await github.fetchReviewContext(PR_URL);
  console.log(`[CI-Review] 上下文获取完成: ${context.files.length} files, ${context.commits.length} commits`);

  // 2. Run full analysis (总结 + 风险扫描 + 建议 → 纯 LLM，无需 DB)
  console.log("[CI-Review] 开始 AI 分析...");
  const startTime = Date.now();
  const result = await runFullAnalysis(context);
  console.log(`[CI-Review] 分析完成 (${Date.now() - startTime}ms), score=${result.overallScore}, issues=${result.issues.length}`);

  // 3. Build comment
  const commentBody = buildPRComment(result, PR_URL);

  // 4. Post comment to PR
  const { Octokit } = await import("octokit");
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  // 从 GITHUB_REPOSITORY 环境变量获取 owner/repo
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");
  const prNumber = parseInt(PR_URL.split("/pull/")[1]?.split(/[?#]/)[0] || "0", 10);

  if (!owner || !repo || !prNumber) {
    console.error(`[CI-Review] 无法解析 PR 信息: owner=${owner}, repo=${repo}, pr=${prNumber}`);
    process.exit(1);
  }

  console.log(`[CI-Review] 发布评论到 ${owner}/${repo}#${prNumber}...`);
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: commentBody,
  });
  console.log("[CI-Review] 评论已发布");
}

main().catch((err) => {
  console.error("[CI-Review] 失败:", err);
  process.exit(1);
});

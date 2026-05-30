/**
 * 本地测试 CI Review（不依赖 GitHub Actions）
 *
 * 用法:
 *   npx tsx scripts/test-ci-review.ts <pr-url>
 *
 * 功能: 拉取 PR 上下文 + 跑分析 + 输出结果，但不发评论
 */

import { GitHubService } from "../src/backend/lib/github";
import { runFullAnalysis } from "../src/backend/services/analyzer";

const PR_URL = process.argv[2];

if (!PR_URL) {
  console.error("用法: npx tsx scripts/test-ci-review.ts <pr-url>");
  console.error("示例: npx tsx scripts/test-ci-review.ts https://github.com/owner/repo/pull/123");
  process.exit(1);
}

// 环境变量检查
const checks = [
  ["DEEPSEEK_API_KEY", process.env.DEEPSEEK_API_KEY],
  ["GITHUB_TOKEN", process.env.GITHUB_TOKEN],
];

let missing = false;
for (const [name, val] of checks) {
  const ok = !!val;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : " — 未设置"}`);
  if (!ok) missing = true;
}
if (missing) {
  console.error("\n请设置缺失的环境变量后重试");
  process.exit(1);
}

async function main() {
  console.log(`\n📋 PR: ${PR_URL}\n`);

  // Step 1
  console.log("═══ Step 1: 获取 PR 上下文 ═══");
  const github = new GitHubService();
  const context = await github.fetchReviewContext(PR_URL);
  console.log(`  files: ${context.files.length}`);
  console.log(`  commits: ${context.commits.length}`);
  console.log(`  title: ${context.prTitle}`);
  console.log(`  branch: ${context.branchFrom} → ${context.branchTo}`);
  console.log("");

  // Step 2
  console.log("═══ Step 2: AI 分析 ═══");
  const startTime = Date.now();
  const result = await runFullAnalysis(context);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  耗时: ${elapsed}s`);
  console.log(`  评分: ${result.overallScore}/100`);
  console.log(`  决策: ${result.decision} — ${result.decisionReason}`);
  console.log(`  问题数: ${result.issues.length}`);
  console.log("");

  // Step 3: 问题概览
  if (result.issues.length > 0) {
    console.log("═══ Step 3: 问题列表 ═══");
    const sevs = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
    for (const sev of sevs) {
      const items = result.issues.filter((i) => i.severity === sev);
      if (items.length === 0) continue;
      console.log(`\n  [${sev}] ${items.length} 个`);
      for (const iss of items) {
        const hasSuggestion = !!((iss as { suggestion?: unknown }).suggestion);
        console.log(`    - ${iss.title}`);
        console.log(`      ${iss.filePath}:${iss.lineStart} | ${iss.category} | 置信度 ${Math.round(iss.confidence * 100)}%`);
        if (hasSuggestion) console.log("      💡 修复建议已生成");
      }
    }
    console.log("");
  }

  // Step 4
  console.log("═══ Step 4: 总结 ═══");
  console.log(result.summary);
  console.log("");

  console.log("✅ 本地测试通过。如果满意，开启 PR 后 GitHub Actions 会自动运行。");
}

main().catch((err) => {
  console.error("\n❌ 测试失败:", err instanceof Error ? err.message : err);
  process.exit(1);
});

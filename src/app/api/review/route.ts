import { NextRequest, NextResponse } from "next/server";
import { parsePRUrl, GitHubService } from "@/backend/lib/github";
import { requireAuth } from "@/backend/lib/session";
import { createReview, updateReviewStatus } from "@/backend/services/review";

export async function POST(request: NextRequest) {
  try {
    // 鉴权
    const session = await requireAuth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    // 解析请求
    const body = await request.json();
    const { prUrl } = body;

    if (!prUrl || typeof prUrl !== "string") {
      return NextResponse.json({ error: "请提供 PR URL" }, { status: 400 });
    }

    // 解析 PR URL
    let prInfo;
    try {
      prInfo = parsePRUrl(prUrl);
    } catch {
      return NextResponse.json({ error: "无效的 GitHub PR URL" }, { status: 400 });
    }

    // 获取 PR 元信息
    const github = new GitHubService();
    const meta = await github.getPRMeta(prInfo.owner, prInfo.repo, prInfo.prNumber);

    // 创建 Review 记录
    const review = await createReview({
      prUrl,
      prTitle: meta.title,
      repoName: `${prInfo.owner}/${prInfo.repo}`,
      branchFrom: meta.branchFrom,
      branchTo: meta.branchTo,
      userId: session.user.id,
      metadata: {
        filesChanged: meta.filesChanged,
        additions: meta.additions,
        deletions: meta.deletions,
      },
    });

    // 异步启动分析（不阻塞 HTTP 响应）
    analyzePRInBackground(review.id, prUrl).catch(console.error);

    return NextResponse.json({ id: review.id, status: review.status });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    console.error("创建 Review 失败:", error);
    return NextResponse.json({ error: "分析请求失败" }, { status: 500 });
  }
}

/** 后台异步执行 PR 分析 */
async function analyzePRInBackground(reviewId: string, prUrl: string) {
  try {
    await updateReviewStatus(reviewId, "FETCHING");

    const github = new GitHubService();
    const prInfo = parsePRUrl(prUrl);
    const meta = await github.getPRMeta(prInfo.owner, prInfo.repo, prInfo.prNumber);

    // TODO: Phase 2 - 接入 AI 分析流水线
    // 目前先走通数据流：创建 context → 写入示例数据

    await updateReviewStatus(reviewId, "COMPLETED", {
      summary: `## PR 变更总结\n\n本次 PR 修改了 ${meta.filesChanged} 个文件，共 +${meta.additions} -${meta.deletions} 行代码。\n\n*(AI 分析流水线即将在 Phase 2 接入)*`,
      overallScore: null,
      decision: null,
    });
  } catch (error) {
    console.error(`Review ${reviewId} 分析失败:`, error);
    await updateReviewStatus(reviewId, "FAILED");
  }
}

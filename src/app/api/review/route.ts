import { NextRequest, NextResponse } from "next/server";
import { parsePRUrl, GitHubService } from "@/backend/lib/github";
import { requireAuth } from "@/backend/lib/session";
import { createReview, updateReviewStatus, saveIssues } from "@/backend/services/review";
import { ContextBuilder } from "@/backend/services/context";
import { runFullAnalysis } from "@/backend/services/analyzer";

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

/** 后台异步执行 AI 分析 */
async function analyzePRInBackground(reviewId: string, prUrl: string) {
  try {
    // 1. 获取代码上下文
    await updateReviewStatus(reviewId, "FETCHING");
    const github = new GitHubService();
    const contextBuilder = new ContextBuilder(github);
    const context = await contextBuilder.build(prUrl);

    // 2. AI 分析
    await updateReviewStatus(reviewId, "ANALYZING");
    const result = await runFullAnalysis(context);

    // 3. 保存问题
    await saveIssues(reviewId, result.issues.map((issue) => ({
      filePath: issue.filePath,
      lineStart: issue.lineStart,
      lineEnd: issue.lineEnd,
      layer: issue.layer,
      severity: issue.severity,
      category: issue.category,
      title: issue.title,
      description: issue.description,
      codeSnippet: issue.codeSnippet,
      confidence: issue.confidence,
      source: issue.source,
    })));

    // 4. 完成
    await updateReviewStatus(reviewId, "COMPLETED", {
      summary: result.summary,
      overallScore: result.overallScore,
      decision: result.decision as "APPROVE" | "COMMENT" | "REQUEST_CHANGES",
      decisionReason: result.decisionReason,
    });
  } catch (error) {
    console.error(`Review ${reviewId} 分析失败:`, error);
    await updateReviewStatus(reviewId, "FAILED");
  }
}

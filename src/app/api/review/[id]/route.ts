import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/lib/session";
import { getReview, updateReviewStatus, clearIssues, analyzePRInBackground } from "@/backend/services/review";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`[GET /api/review/${params.id}] 请求到达`);

    const session = await requireAuth();
    if (!session?.user?.id) {
      console.log(`[GET /api/review/${params.id}] 未登录`);
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    console.log(`[GET /api/review/${params.id}] 用户: ${session.user.id}`);

    const review = await getReview(params.id);
    if (!review) {
      console.log(`[GET /api/review/${params.id}] Review 不存在`);
      return NextResponse.json({ error: "Review 不存在" }, { status: 404 });
    }
    console.log(`[GET /api/review/${params.id}] 状态: ${review.status}, 创建于: ${review.createdAt}`);

    // 验证所有权
    if (review.userId !== session.user.id) {
      console.log(`[GET /api/review/${params.id}] 无权访问: review.userId=${review.userId}, session.user.id=${session.user.id}`);
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    // 检测卡住的 Review（ANALYZING/FETCHING 超过 5 分钟 → 标记为 FAILED）
    const STUCK_TIMEOUT_MS = 5 * 60 * 1000;
    const isRunning = review.status === "ANALYZING" || review.status === "FETCHING";
    const elapsed = Date.now() - new Date(review.createdAt).getTime();
    const isStuck = isRunning && elapsed > STUCK_TIMEOUT_MS;
    console.log(`[GET /api/review/${params.id}] isRunning: ${isRunning}, elapsed: ${elapsed}ms, isStuck: ${isStuck}`);

    if (isStuck) {
      await updateReviewStatus(params.id, "FAILED");
      review.status = "FAILED";
      console.log(`[GET /api/review/${params.id}] 标记为 FAILED（卡住超过 5 分钟）`);
    }

    console.log(`[GET /api/review/${params.id}] 返回数据, issues: ${review.issues?.length || 0}`);

    return NextResponse.json({
      id: review.id,
      prUrl: review.prUrl,
      prTitle: review.prTitle,
      repoName: review.repoName,
      status: review.status,
      summary: review.summary,
      overallScore: review.overallScore,
      decision: review.decision,
      decisionReason: review.decisionReason,
      createdAt: review.createdAt,
      issues: review.issues.map((issue) => {
        const { feedbacks, ...rest } = issue;
        return {
          ...rest,
          feedback: feedbacks[0] || null,
        };
      }),
      metadata: review.metadata,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    console.error("获取 Review 失败:", error);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}

/** 重试失败的 Review 分析 */
export async function PUT(
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

    // 只允许重试失败或卡住的 Review
    if (review.status === "ANALYZING" || review.status === "FETCHING") {
      return NextResponse.json({ error: "Review 正在分析中，请稍后再试" }, { status: 409 });
    }

    if (review.status === "COMPLETED") {
      return NextResponse.json({ error: "Review 已完成，无需重试" }, { status: 400 });
    }

    // 清除旧的问题数据，重新分析
    await clearIssues(params.id);

    // 异步启动分析
    analyzePRInBackground(review.id, review.prUrl).catch(console.error);

    return NextResponse.json({ id: review.id, status: "FETCHING" });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    console.error("重试 Review 失败:", error);
    return NextResponse.json({ error: "重试失败" }, { status: 500 });
  }
}

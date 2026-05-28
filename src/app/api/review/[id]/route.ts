import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { getReview } from "@/services/review";

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

    // 验证所有权
    if (review.userId !== session.user.id) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

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
      issues: review.issues,
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/backend/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const reviewId = params.id;

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true },
    });

    if (!review) {
      return NextResponse.json({ error: "Review 不存在" }, { status: 404 });
    }

    // 获取该 Review 下所有 Issue 的 ID
    const issues = await prisma.reviewIssue.findMany({
      where: { reviewId },
      select: { id: true },
    });

    const issueIds = issues.map((i) => i.id);

    if (issueIds.length === 0) {
      return NextResponse.json({
        total: 0,
        useful: 0,
        falsePositive: 0,
        needsReview: 0,
      });
    }

    // 按反馈类型分组统计
    const feedbacks = await prisma.issueFeedback.findMany({
      where: { issueId: { in: issueIds } },
      select: { feedback: true },
    });

    const total = feedbacks.length;
    const useful = feedbacks.filter((f) => f.feedback === "USEFUL").length;
    const falsePositive = feedbacks.filter((f) => f.feedback === "FALSE_POSITIVE").length;
    const needsReview = feedbacks.filter((f) => f.feedback === "NEEDS_REVIEW").length;

    return NextResponse.json({ total, useful, falsePositive, needsReview });
  } catch (error) {
    console.error("获取反馈统计失败:", error);
    return NextResponse.json({ error: "获取反馈统计失败" }, { status: 500 });
  }
}

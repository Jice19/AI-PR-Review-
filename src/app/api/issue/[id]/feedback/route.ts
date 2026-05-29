import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/lib/session";
import { prisma } from "@/backend/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const issueId = params.id;
    const body = await request.json();
    const { feedback } = body;

    if (!feedback || !["USEFUL", "FALSE_POSITIVE", "NEEDS_REVIEW"].includes(feedback)) {
      return NextResponse.json(
        { error: "feedback 必须为 USEFUL、FALSE_POSITIVE 或 NEEDS_REVIEW" },
        { status: 400 }
      );
    }

    // 验证 issue 存在
    const issue = await prisma.reviewIssue.findUnique({
      where: { id: issueId },
      select: { id: true, reviewId: true },
    });

    if (!issue) {
      return NextResponse.json({ error: "Issue 不存在" }, { status: 404 });
    }

    // Upsert: 每个 issue 只允许一条反馈记录
    const createdBy = session.user.name || session.user.id;
    const result = await prisma.issueFeedback.upsert({
      where: { issueId },
      create: {
        issueId,
        feedback,
        createdBy,
      },
      update: {
        feedback,
        createdBy,
      },
    });

    // Fire-and-forget: 异步向量化写入（不阻塞响应）
    if (process.env.BAILIAN_API_KEY) {
      const { learnFromFeedback } = await import("@/backend/services/feedback-learner");
      learnFromFeedback({ issueId }).catch((e: unknown) =>
        console.error("[FeedbackVector] 异步写入失败:", e instanceof Error ? e.message : e)
      );
    } else {
      console.warn("[FeedbackVector] BAILIAN_API_KEY 未设置，跳过向量化写入");
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    console.error("提交反馈失败:", error);
    return NextResponse.json({ error: "提交反馈失败" }, { status: 500 });
  }
}

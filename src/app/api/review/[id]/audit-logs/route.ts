import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/lib/session";
import { prisma } from "@/backend/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const reviewId = params.id;

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      select: { userId: true },
    });

    if (!review) {
      return NextResponse.json({ error: "Review 不存在" }, { status: 404 });
    }

    if (review.userId !== session.user.id) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const logs = await prisma.auditLog.findMany({
      where: { reviewId },
      orderBy: { createdAt: "asc" },
    });

    const summary = {
      totalCalls: logs.length,
      totalTokens: logs.reduce((sum, l) => sum + (l.totalTokens || 0), 0),
      totalDurationMs: logs.reduce((sum, l) => sum + l.durationMs, 0),
    };

    return NextResponse.json({ logs, summary });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    console.error("获取审计日志失败:", error);
    return NextResponse.json({ error: "获取审计日志失败" }, { status: 500 });
  }
}

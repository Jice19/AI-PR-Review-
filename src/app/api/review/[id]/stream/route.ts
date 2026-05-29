import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/lib/session";
import { getReview, drainBufferedEvents } from "@/backend/services/review";

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
    if (review.userId !== session.user.id) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const reviewId = params.id;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    function cleanup() {
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
      if (timeout) { clearTimeout(timeout); timeout = null; }
      const streams = (globalThis as Record<string, unknown>).__reviewStreams as
        | Record<string, ReadableStreamDefaultController>
        | undefined;
      if (streams) delete streams[reviewId];
    }

    const stream = new ReadableStream({
      start(controller) {
        const g = globalThis as Record<string, unknown>;
        g.__reviewStreams = g.__reviewStreams || {};
        (g.__reviewStreams as Record<string, ReadableStreamDefaultController>)[reviewId] = controller;

        // 回放已缓冲的事件（客户端连接前 emitSSE 发出的 token/phase 事件）
        const buffered = drainBufferedEvents(reviewId);
        for (const evt of buffered) {
          const payload = `event: ${evt.type}\ndata: ${JSON.stringify(evt.data)}\n\n`;
          controller.enqueue(new TextEncoder().encode(payload));
        }

        // 如果 review 已完成，直接发 complete 关闭
        if (review.status === "COMPLETED") {
          if (!buffered.some((e) => e.type === "complete")) {
            const data = JSON.stringify({
              overallScore: review.overallScore,
              decision: review.decision,
              totalIssues: review.issues?.length || 0,
            });
            controller.enqueue(new TextEncoder().encode(`event: complete\ndata: ${data}\n\n`));
          }
          controller.close();
          return;
        }

        if (review.status === "FAILED") {
          controller.enqueue(
            new TextEncoder().encode(`event: error\ndata: ${JSON.stringify({ error: "分析失败" })}\n\n`)
          );
          controller.close();
          return;
        }

        // review 仍在分析中：心跳保持连接，后续 event 由 emitSSE 实时推送
        heartbeat = setInterval(() => {
          try { controller.enqueue(new TextEncoder().encode(": heartbeat\n\n")); } catch { cleanup(); }
        }, 15000);

        // 兜底超时（10 分钟）
        timeout = setTimeout(() => {
          try { controller.close(); } catch { /* already closed */ }
          cleanup();
        }, 10 * 60 * 1000);
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    console.error("SSE stream 创建失败:", error);
    return NextResponse.json({ error: "创建流失败" }, { status: 500 });
  }
}

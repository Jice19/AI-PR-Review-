"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ReviewReport } from "@/types";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "等待中",
  FETCHING: "获取 PR 数据中",
  ANALYZING: "分析中",
  SUGGESTING: "生成建议中",
  COMPLETED: "分析完成",
  FAILED: "分析失败",
};

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [review, setReview] = useState<ReviewReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    let interval: NodeJS.Timeout;

    const fetchReview = async () => {
      try {
        const res = await fetch(`/api/review/${id}`);
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/login");
            return;
          }
          throw new Error("获取失败");
        }
        const data = await res.json();
        if (!cancelled) {
          setReview(data);

          // 如果分析完成或失败，停止轮询
          if (data.status === "COMPLETED" || data.status === "FAILED") {
            clearInterval(interval);
          }
        }
      } catch {
        if (!cancelled) setError("加载失败");
      }
    };

    fetchReview();
    interval = setInterval(fetchReview, 2000); // 每 2 秒轮询

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* 头部 */}
      <div className="mb-8">
        <button
          onClick={() => router.push("/")}
          className="mb-4 text-sm text-muted-foreground hover:text-foreground"
        >
          ← 返回
        </button>
        <h1 className="text-2xl font-bold">{review.prTitle}</h1>
        <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
          <span>{review.repoName}</span>
          <span>•</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              review.status === "COMPLETED"
                ? "bg-green-100 text-green-700"
                : review.status === "FAILED"
                  ? "bg-red-100 text-red-700"
                  : "bg-blue-100 text-blue-700"
            }`}
          >
            {STATUS_LABELS[review.status] || review.status}
          </span>
        </div>
      </div>

      {/* 分析结果或进行中状态 */}
      {review.status === "COMPLETED" ? (
        <>
          {/* 总结 */}
          {review.summary && (
            <div className="mb-8 rounded-lg border bg-card p-6">
              <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
                {review.summary}
              </div>
            </div>
          )}

          {/* 评分 */}
          {review.overallScore !== null && (
            <div className="mb-8 rounded-lg border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">综合评分</p>
              <p className="mt-2 text-5xl font-bold">{review.overallScore}</p>
              <p className="mt-1 text-sm text-muted-foreground">/ 100</p>
            </div>
          )}

          {/* Decision */}
          {review.decision && (
            <div
              className={`mb-8 rounded-lg border p-6 text-center ${
                review.decision === "APPROVE"
                  ? "bg-green-50"
                  : review.decision === "REQUEST_CHANGES"
                    ? "bg-red-50"
                    : "bg-yellow-50"
              }`}
            >
              <p className="text-lg font-bold">
                {review.decision === "APPROVE"
                  ? "✅ 建议通过"
                  : review.decision === "REQUEST_CHANGES"
                    ? "❌ 需要修改"
                    : "💬 建议评论"}
              </p>
              {review.decisionReason && (
                <p className="mt-1 text-sm text-muted-foreground">{review.decisionReason}</p>
              )}
            </div>
          )}

          {/* 问题列表 */}
          {review.stageResults?.map((stage) => (
            <div key={stage.stage} className="mb-6 rounded-lg border bg-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">{stage.stage}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    stage.status === "PASSED"
                      ? "bg-green-100 text-green-700"
                      : stage.status === "FAILED"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {stage.score}分
                </span>
              </div>
              {stage.issues.length === 0 ? (
                <p className="text-sm text-muted-foreground">未发现问题</p>
              ) : (
                <div className="space-y-3">
                  {stage.issues.map((issue) => (
                    <div
                      key={issue.id}
                      className="rounded-md border-l-2 bg-muted/30 p-4"
                      style={{
                        borderLeftColor:
                          issue.severity === "CRITICAL"
                            ? "#ef4444"
                            : issue.severity === "HIGH"
                              ? "#f97316"
                              : issue.severity === "MEDIUM"
                                ? "#eab308"
                                : "#3b82f6",
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                                issue.severity === "CRITICAL"
                                  ? "bg-red-100 text-red-700"
                                  : issue.severity === "HIGH"
                                    ? "bg-orange-100 text-orange-700"
                                    : issue.severity === "MEDIUM"
                                      ? "bg-yellow-100 text-yellow-700"
                                      : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {issue.severity}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {issue.category}
                            </span>
                          </div>
                          <p className="mt-1 font-medium">{issue.title}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {issue.filePath}:{issue.lineStart}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{issue.description}</p>
                      {issue.codeSnippet && (
                        <pre className="mt-2 overflow-x-auto rounded bg-background p-3 text-xs">
                          <code>{issue.codeSnippet}</code>
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      ) : (
        <div className="flex min-h-[300px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-muted-foreground">{STATUS_LABELS[review.status]}</p>
          </div>
        </div>
      )}
    </div>
  );
}

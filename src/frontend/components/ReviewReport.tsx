"use client";

import type { ReviewReport as ReviewReportType } from "@/backend/types";
import { IssueCard } from "./IssueCard";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "等待中",
  FETCHING: "获取 PR 数据中",
  ANALYZING: "分析中",
  SUGGESTING: "生成建议中",
  COMPLETED: "分析完成",
  FAILED: "分析失败",
};

interface ReviewReportProps {
  review: ReviewReportType;
  onBack: () => void;
}

export function ReviewReport({ review, onBack }: ReviewReportProps) {
  const isCompleted = review.status === "COMPLETED";
  const statusColor =
    isCompleted ? "bg-green-100 text-green-700"
    : review.status === "FAILED" ? "bg-red-100 text-red-700"
    : "bg-blue-100 text-blue-700";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* 头部 */}
      <div className="mb-8">
        <button onClick={onBack} className="mb-4 text-sm text-muted-foreground hover:text-foreground">
          ← 返回
        </button>
        <h1 className="text-2xl font-bold">{review.prTitle}</h1>
        <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
          <span>{review.repoName}</span>
          <span>•</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>
            {STATUS_LABELS[review.status] || review.status}
          </span>
        </div>
      </div>

      {/* 分析中 */}
      {!isCompleted && review.status !== "FAILED" && (
        <div className="flex min-h-[300px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-muted-foreground">{STATUS_LABELS[review.status]}</p>
          </div>
        </div>
      )}

      {/* 分析完成 */}
      {isCompleted && (
        <>
          {review.summary && (
            <div className="mb-8 rounded-lg border bg-card p-6">
              <h2 className="mb-3 text-lg font-semibold">变更总结</h2>
              <div className="whitespace-pre-wrap text-sm text-muted-foreground">{review.summary}</div>
            </div>
          )}

          {review.overallScore !== null && (
            <div className="mb-8 rounded-lg border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">综合评分</p>
              <p className="mt-2 text-5xl font-bold">{review.overallScore}</p>
              <p className="mt-1 text-sm text-muted-foreground">/ 100</p>
            </div>
          )}

          {review.decision && (
            <div
              className={`mb-8 rounded-lg border p-6 text-center ${
                review.decision === "APPROVE" ? "bg-green-50"
                : review.decision === "REQUEST_CHANGES" ? "bg-red-50"
                : "bg-yellow-50"
              }`}
            >
              <p className="text-lg font-bold">
                {review.decision === "APPROVE" ? "✅ 建议通过"
                : review.decision === "REQUEST_CHANGES" ? "❌ 需要修改"
                : "💬 建议评论"}
              </p>
              {review.decisionReason && (
                <p className="mt-1 text-sm text-muted-foreground">{review.decisionReason}</p>
              )}
            </div>
          )}

          {review.stageResults?.map((stage) => (
            <div key={stage.stage} className="mb-6 rounded-lg border bg-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">{stage.stage}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    stage.status === "PASSED" ? "bg-green-100 text-green-700"
                    : stage.status === "FAILED" ? "bg-red-100 text-red-700"
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
                    <IssueCard key={issue.id} issue={issue} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {review.status === "FAILED" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-700">分析失败</p>
          <p className="mt-1 text-sm text-red-600">请返回重试</p>
        </div>
      )}
    </div>
  );
}

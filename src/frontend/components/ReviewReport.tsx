"use client";

import { useState } from "react";
import type { Issue, ReviewReport as ReviewReportType } from "@/backend/types";
import { IssueCard } from "./IssueCard";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "等待中",
  FETCHING: "获取 PR 数据中",
  ANALYZING: "AI 分析中...",
  SUGGESTING: "生成建议中",
  COMPLETED: "分析完成",
  FAILED: "分析失败",
};

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  CRITICAL: { color: "text-red-700", bg: "bg-red-50", border: "border-red-400", label: "严重问题" },
  HIGH: { color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-400", label: "高危问题" },
  MEDIUM: { color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-400", label: "中危问题" },
  LOW: { color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-400", label: "低危问题" },
};

interface ReviewReportProps {
  review: ReviewReportType;
  onBack: () => void;
  streamText?: string;
  streamPhase?: string;
  progress?: { analyzed: number; totalFiles: number; totalIssues: number } | null;
}

function groupIssuesBySeverity(issues: Issue[]) {
  const groups: Record<string, Issue[]> = {};
  for (const issue of issues) {
    const sev = issue.severity || "LOW";
    if (!groups[sev]) groups[sev] = [];
    groups[sev].push(issue);
  }
  return SEVERITY_ORDER.filter((s) => groups[s]).map((s) => ({ severity: s, issues: groups[s] }));
}

export function ReviewReport({ review, onBack, streamText, streamPhase, progress }: ReviewReportProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (sev: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [sev]: !prev[sev] }));
  };

  const isCompleted = review.status === "COMPLETED";
  const isRunning = !isCompleted && review.status !== "FAILED";
  const statusColor =
    isCompleted ? "bg-green-100 text-green-700"
    : review.status === "FAILED" ? "bg-red-100 text-red-700"
    : "bg-blue-100 text-blue-700";

  // Extract issues from review (API returns them)
  const rawIssues = (review as ReviewReportType & { issues?: Issue[] }).issues || [];
  const severityGroups = isCompleted ? groupIssuesBySeverity(rawIssues) : [];

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

      {/* 分析中：流式面板 + 进度条 */}
      {isRunning && (
        <div className="mb-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm font-medium text-muted-foreground">
              {streamPhase || STATUS_LABELS[review.status]}
            </p>
          </div>

          {progress && (
            <div className="mb-4">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>进度: {progress.analyzed}/{progress.totalFiles} 个文件</span>
                <span>已发现 {progress.totalIssues} 个问题</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${(progress.analyzed / progress.totalFiles) * 100}%` }}
                />
              </div>
            </div>
          )}

          {streamText && (
            <div className="rounded-lg border bg-card p-6">
              <div className="whitespace-pre-wrap text-sm text-muted-foreground">{streamText}</div>
            </div>
          )}
        </div>
      )}

      {/* 分析完成：总结 + 评分 + 决策 */}
      {isCompleted && review.summary && (
        <div className="mb-8 rounded-lg border bg-card p-6">
          <h2 className="mb-3 text-lg font-semibold">变更总结</h2>
          <div className="whitespace-pre-wrap text-sm text-muted-foreground">{review.summary}</div>
        </div>
      )}

      {isCompleted && review.overallScore !== null && (
        <div className="mb-8 rounded-lg border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">综合评分</p>
          <p className="mt-2 text-5xl font-bold">{review.overallScore}</p>
          <p className="mt-1 text-sm text-muted-foreground">/ 100</p>
        </div>
      )}

      {isCompleted && review.decision && (
        <div
          className={`mb-8 rounded-lg border p-6 text-center ${
            review.decision === "APPROVE" ? "bg-green-50"
            : review.decision === "REQUEST_CHANGES" ? "bg-red-50"
            : "bg-yellow-50"
          }`}
        >
          <p className="text-lg font-bold">
            {review.decision === "APPROVE" ? "建议通过"
            : review.decision === "REQUEST_CHANGES" ? "需要修改"
            : "建议评论"}
          </p>
          {review.decisionReason && (
            <p className="mt-1 text-sm text-muted-foreground">{review.decisionReason}</p>
          )}
        </div>
      )}

      {/* 按严重程度分组（分析中 & 完成后都显示） */}
      {severityGroups.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold">
            发现的问题
            {isRunning && <span className="ml-2 text-sm font-normal text-muted-foreground">（分析中，持续更新...）</span>}
          </h2>
          {severityGroups.map(({ severity, issues }) => {
            const cfg = SEVERITY_CONFIG[severity];
            const collapsed = collapsedGroups[severity];
            return (
              <div
                key={severity}
                className={`rounded-lg border-l-4 ${cfg.border} ${cfg.bg} overflow-hidden`}
              >
                <button
                  onClick={() => toggleGroup(severity)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <span className={`text-sm font-semibold ${cfg.color}`}>
                    {cfg.label} ({issues.length})
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {collapsed ? "展开 ▲" : "收起 ▼"}
                  </span>
                </button>
                {!collapsed && (
                  <div className="space-y-3 border-t border-border/50 px-4 py-3">
                    {issues.map((issue) => (
                      <IssueCard key={issue.id} issue={issue} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {severityGroups.length === 0 && isCompleted && (
        <div className="rounded-lg border bg-card p-6 text-center">
          <p className="text-muted-foreground">未发现问题</p>
        </div>
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

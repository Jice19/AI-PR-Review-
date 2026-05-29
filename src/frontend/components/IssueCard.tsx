"use client";

import { useState } from "react";
import type { Issue } from "@/backend/types";

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#eab308",
  LOW: "#3b82f6",
};

const SEVERITY_BG: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  LOW: "bg-blue-100 text-blue-700",
};

export function IssueCard({ issue }: { issue: Issue }) {
  const [showSuggestion, setShowSuggestion] = useState(false);
  const hasSuggestion = !!issue.suggestion;

  return (
    <div
      className="rounded-md border-l-2 bg-muted/30 p-4"
      style={{ borderLeftColor: SEVERITY_COLORS[issue.severity] || "#6b7280" }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${SEVERITY_BG[issue.severity] || ""}`}>
              {issue.severity}
            </span>
            <span className="text-xs text-muted-foreground">{issue.category}</span>
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

      {/* 修复建议 */}
      {hasSuggestion && (
        <div className="mt-3">
          <button
            onClick={() => setShowSuggestion(!showSuggestion)}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {showSuggestion ? "收起修复建议 ▲" : "查看修复建议 ▼"}
          </button>
          {showSuggestion && issue.suggestion && (
            <div className="mt-3 space-y-3">
              {issue.suggestion.description && (
                <p className="text-sm text-muted-foreground">{issue.suggestion.description}</p>
              )}
              {/* Before/After 代码对比 */}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {issue.suggestion.codeBefore && (
                  <div className="rounded border border-red-200 bg-red-50/50 overflow-hidden">
                    <div className="bg-red-100 px-3 py-1 text-xs font-medium text-red-700">修复前</div>
                    <pre className="overflow-x-auto p-3 text-xs text-red-800">
                      <code>{issue.suggestion.codeBefore}</code>
                    </pre>
                  </div>
                )}
                {issue.suggestion.codeAfter && (
                  <div className="rounded border border-green-200 bg-green-50/50 overflow-hidden">
                    <div className="bg-green-100 px-3 py-1 text-xs font-medium text-green-700">修复后</div>
                    <pre className="overflow-x-auto p-3 text-xs text-green-800">
                      <code>{issue.suggestion.codeAfter}</code>
                    </pre>
                  </div>
                )}
              </div>
              {/* 安全性说明 */}
              {issue.suggestion.securityRationale && (
                <div className="rounded border border-blue-200 bg-blue-50/50 p-3">
                  <p className="text-xs font-medium text-blue-700 mb-1">安全性说明</p>
                  <p className="text-xs text-blue-800">{issue.suggestion.securityRationale}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

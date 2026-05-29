"use client";

import { useState } from "react";
import type { Issue } from "@/backend/types";

const SEVERITY_COLORS: Record<string, { dot: string; badge: string }> = {
  CRITICAL: { dot: "bg-red-500", badge: "bg-red-50 text-red-700 border-red-300" },
  HIGH: { dot: "bg-orange-500", badge: "bg-orange-50 text-orange-700 border-orange-300" },
  MEDIUM: { dot: "bg-yellow-500", badge: "bg-yellow-50 text-yellow-700 border-yellow-300" },
  LOW: { dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700 border-blue-300" },
};

export function IssueCard({ issue, index = 0 }: { issue: Issue; index?: number }) {
  const [showSuggestion, setShowSuggestion] = useState(false);
  const hasSuggestion = !!issue.suggestion;
  const colors = SEVERITY_COLORS[issue.severity] || SEVERITY_COLORS.LOW;
  const delay = `${index * 0.05}s`;

  return (
    <div
      className="animate-fade-in-up"
      style={{ animationDelay: delay, animationFillMode: "both" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`h-2 w-2 shrink-0 rounded-full ${colors.dot}`} />
          <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${colors.badge}`}>
            {issue.severity}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">{issue.category}</span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground/50 font-mono">
          {issue.filePath}:{issue.lineStart}
        </span>
      </div>

      <p className="mt-2 font-medium text-sm leading-snug">{issue.title}</p>
      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{issue.description}</p>

      {issue.codeSnippet && (
        <pre className="mt-3 overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs leading-relaxed ring-1 ring-inset ring-border">
          <code>{issue.codeSnippet}</code>
        </pre>
      )}

      {/* Suggestion */}
      {hasSuggestion && (
        <div className="mt-3">
          <button
            onClick={() => setShowSuggestion(!showSuggestion)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
          >
            <svg className={`h-3 w-3 transition-transform ${showSuggestion ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {showSuggestion ? "收起修复建议" : "查看修复建议"}
          </button>

          {showSuggestion && issue.suggestion && (
            <div className="mt-3 space-y-3 animate-fade-in">
              {issue.suggestion.description && (
                <p className="text-sm text-muted-foreground">{issue.suggestion.description}</p>
              )}

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {issue.suggestion.codeBefore && (
                  <div className="overflow-hidden rounded-lg border border-red-200 bg-red-50">
                    <div className="border-b border-red-200 bg-red-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-red-700">
                      修复前
                    </div>
                    <pre className="overflow-x-auto p-3 text-xs text-red-800">
                      <code>{issue.suggestion.codeBefore}</code>
                    </pre>
                  </div>
                )}
                {issue.suggestion.codeAfter && (
                  <div className="overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50">
                    <div className="border-b border-emerald-200 bg-emerald-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                      修复后
                    </div>
                    <pre className="overflow-x-auto p-3 text-xs text-emerald-800">
                      <code>{issue.suggestion.codeAfter}</code>
                    </pre>
                  </div>
                )}
              </div>

              {issue.suggestion.securityRationale && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700 mb-1">安全性说明</p>
                  <p className="text-xs text-indigo-800 leading-relaxed">{issue.suggestion.securityRationale}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import type { Issue, ReviewReport as ReviewReportType } from "@/backend/types";
import { IssueCard } from "./IssueCard";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "等待中",
  FETCHING: "获取代码",
  ANALYZING: "分析中",
  SUGGESTING: "生成建议",
  COMPLETED: "完成",
  FAILED: "失败",
};

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; border: string; label: string; icon: string }> = {
  CRITICAL: { color: "text-red-600", bg: "bg-red-50", border: "border-red-300", label: "严重", icon: "🔴" },
  HIGH: { color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-300", label: "高危", icon: "🟠" },
  MEDIUM: { color: "text-yellow-600", bg: "bg-yellow-50", border: "border-yellow-300", label: "中危", icon: "🟡" },
  LOW: { color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-300", label: "低危", icon: "🔵" },
};

interface ReviewReportProps {
  review: ReviewReportType;
  onBack: () => void;
  streamText?: string;
  errorMsg?: string;
  progress?: { analyzed: number; totalFiles: number; totalIssues: number; suggestionCurrent?: number; suggestionTotal?: number } | null;
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

// ========== Step Indicator (compact single-line) ==========

function StepBar({ phase, progress }: { phase: string; progress: ReviewReportProps["progress"] }) {
  const steps = ["FETCHING", "ANALYZING", "SUGGESTING"];
  const labels = ["获取代码", "AI 分析", "生成建议"];
  const currentIdx = steps.indexOf(phase);

  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s} className="flex items-center gap-1.5">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                done ? "bg-emerald-100 text-emerald-600"
                : active ? "bg-indigo-500 text-white"
                : "bg-muted text-muted-foreground"
              }`}
            >
              {done ? "✓" : active ? (
                <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : i + 1}
            </span>
            <span className={`text-xs ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}>
              {labels[i]}
            </span>
            {i < 2 && <span className="text-muted-foreground/30 text-xs">·</span>}
          </div>
        );
      })}
      {/* progress stats on the right */}
      {progress && phase === "ANALYZING" && (
        <span className="ml-auto text-xs text-muted-foreground">
          {progress.analyzed}/{progress.totalFiles} 文件 · {progress.totalIssues} 问题
        </span>
      )}
      {progress && phase === "SUGGESTING" && (
        <span className="ml-auto text-xs text-muted-foreground">
          建议 {progress.suggestionCurrent ?? 0}/{progress.suggestionTotal ?? 0}
        </span>
      )}
    </div>
  );
}

// ========== Severity Distribution Bar ==========

function SeverityBar({ severityGroups }: { severityGroups: ReturnType<typeof groupIssuesBySeverity> }) {
  const total = severityGroups.reduce((sum, g) => sum + g.issues.length, 0);
  if (total === 0) return null;

  const counts = SEVERITY_ORDER.map((s) => {
    const group = severityGroups.find((g) => g.severity === s);
    return { sev: s, count: group?.issues.length ?? 0, pct: ((group?.issues.length ?? 0) / total) * 100 };
  }).filter((c) => c.count > 0);

  const colors: Record<string, string> = {
    CRITICAL: "bg-red-500", HIGH: "bg-orange-500", MEDIUM: "bg-yellow-500", LOW: "bg-blue-500",
  };

  return (
    <div className="space-y-2">
      <div className="flex h-1.5 rounded-full overflow-hidden">
        {counts.map((c) => (
          <div
            key={c.sev}
            className={`${colors[c.sev]} transition-all duration-500`}
            style={{ width: `${c.pct}%` }}
          />
        ))}
      </div>
      <div className="flex gap-3 text-[10px]">
        {counts.map((c) => {
          const cfg = SEVERITY_CONFIG[c.sev];
          return (
            <span key={c.sev} className={`flex items-center gap-1 ${cfg.color}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${colors[c.sev]}`} />
              {cfg.label} {c.count}
            </span>
          );
        })}
        <span className="text-muted-foreground ml-auto">共 {total} 个</span>
      </div>
    </div>
  );
}

// ========== Main Component ==========

export function ReviewReport({ review, onBack, streamText, errorMsg, progress }: ReviewReportProps) {
  const [collapsedIssues, setCollapsedIssues] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/review/${review.id}/export`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "导出失败" }));
        alert(err.error || "导出失败");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pr-review-${review.id.slice(0, 8)}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("导出失败，请重试");
    } finally {
      setExporting(false);
    }
  };
  const issueFeedRef = useRef<HTMLDivElement>(null);

  const isCompleted = review.status === "COMPLETED";
  const isRunning = !isCompleted && review.status !== "FAILED";

  const rawIssues = (review as ReviewReportType & { issues?: Issue[] }).issues || [];
  const severityGroups = groupIssuesBySeverity(rawIssues);
  const allIssuesFlat = severityGroups.flatMap((g) => g.issues);

  // Auto-scroll issue feed to bottom as new issues arrive
  useEffect(() => {
    if (issueFeedRef.current && isRunning) {
      issueFeedRef.current.scrollTop = issueFeedRef.current.scrollHeight;
    }
  }, [rawIssues.length, isRunning]);

  // ====== COMPLETED: Report view ======
  if (isCompleted) {
    const scoreColor =
      (review.overallScore ?? 100) >= 80 ? "text-emerald-600"
      : (review.overallScore ?? 0) >= 60 ? "text-amber-600"
      : "text-red-600";
    const scoreBg =
      (review.overallScore ?? 100) >= 80 ? "stroke-emerald-500"
      : (review.overallScore ?? 0) >= 60 ? "stroke-amber-500"
      : "stroke-red-500";
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const scoreProgress = ((review.overallScore ?? 0) / 100) * circumference;

    return (
      <div className="mx-auto max-w-4xl px-4 py-8 animate-fade-in">
        {/* Header */}
        <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m0 0l7 7m-7-7l7-7" />
          </svg>
          返回
        </button>
        <h1 className="text-2xl font-bold tracking-tight">{review.prTitle}</h1>
        <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
          <span>{review.repoName}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            分析完成
          </span>
        </div>

        {/* Export button */}
        <div className="mt-4">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {exporting ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )}
            {exporting ? "导出中..." : "导出文档"}
          </button>
        </div>

        {/* Summary + Score */}
        <div className="mt-8 grid gap-6 lg:grid-cols-3 animate-fade-in-up">
          <div className="glass rounded-xl p-6 lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">变更总结</h2>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{review.summary}</div>
          </div>
          <div className="glass rounded-xl p-6 flex flex-col items-center justify-center gap-3">
            <div className="relative inline-flex items-center justify-center">
              <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
                <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
                  className={`${scoreBg} transition-all duration-1000 ease-out`}
                  strokeDasharray={circumference} strokeDashoffset={circumference - scoreProgress} />
              </svg>
              <span className={`absolute text-3xl font-bold ${scoreColor}`}>{review.overallScore}</span>
            </div>
            <p className="text-xs text-muted-foreground">综合评分</p>
            <div className={`w-full rounded-lg px-4 py-2 text-center text-sm font-semibold ${
              review.decision === "APPROVE" ? "bg-emerald-100 text-emerald-700"
              : review.decision === "REQUEST_CHANGES" ? "bg-red-100 text-red-700"
              : "bg-amber-100 text-amber-700"
            }`}>
              {review.decision === "APPROVE" ? "建议通过" : review.decision === "REQUEST_CHANGES" ? "需要修改" : "建议评论"}
            </div>
            {review.decisionReason && <p className="text-xs text-muted-foreground text-center">{review.decisionReason}</p>}
          </div>
        </div>

        {/* Issues */}
        {severityGroups.length > 0 && (
          <div className="mt-8 space-y-3 animate-fade-in-up">
            <h2 className="text-lg font-semibold">发现的问题</h2>
            <SeverityBar severityGroups={severityGroups} />
            <div className="glass rounded-xl overflow-hidden mt-3">
              {severityGroups.map(({ severity, issues }, gi) => {
                const cfg = SEVERITY_CONFIG[severity];
                const collapsed = collapsedIssues[severity];
                return (
                  <div key={severity} className={gi > 0 ? "border-t border-border/50" : ""}>
                    <button
                      onClick={() => setCollapsedIssues((p) => ({ ...p, [severity]: !p[severity] }))}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-muted/30 transition-colors"
                    >
                      <span className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${cfg.bg} ${cfg.color}`}>
                        {collapsed ? "+" : "−"}
                      </span>
                      <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}问题</span>
                      <span className="text-xs text-muted-foreground">{issues.length} 个</span>
                      <span className="flex-1" />
                      <svg className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {!collapsed && (
                      <div className="border-t border-border/30 px-5 py-4 space-y-4">
                        {issues.map((issue, ii) => (
                          <div key={ii} className="rounded-lg border border-border/30 bg-muted/10 p-4">
                            <IssueCard issue={issue} index={ii} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {severityGroups.length === 0 && (
          <div className="mt-8 glass rounded-xl p-8 text-center animate-fade-in-up">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-muted-foreground">未发现问题，代码质量良好</p>
          </div>
        )}
      </div>
    );
  }

  // ====== FAILED ======
  if (review.status === "FAILED") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="glass rounded-xl p-8 text-center max-w-md">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="font-medium text-red-700">分析失败</p>
          {errorMsg && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 font-mono break-all">{errorMsg}</p>
          )}
          <button onClick={onBack} className="mt-4 text-sm text-indigo-600 hover:underline">返回首页</button>
        </div>
      </div>
    );
  }

  // ====== RUNNING: Live analysis dashboard ======
  const phase = review.status;
  const hasSummary = !!streamText;
  const hasIssues = allIssuesFlat.length > 0;

  return (
    <div className="flex h-screen flex-col animate-fade-in">
      {/* --- Top bar --- */}
      <header className="shrink-0 border-b bg-card/80 backdrop-blur-sm px-5 py-3">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="shrink-0 text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← 返回
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold">{review.prTitle}</h1>
            <p className="text-xs text-muted-foreground">{review.repoName}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
            {STATUS_LABELS[review.status]}
          </span>
        </div>
        <div className="mt-2">
          <StepBar phase={phase} progress={progress} />
        </div>
        {/* Progress bar */}
        {progress && phase === "ANALYZING" && progress.totalFiles > 0 && (
          <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-700 ease-out"
              style={{ width: `${Math.round((progress.analyzed / progress.totalFiles) * 100)}%` }} />
          </div>
        )}
        {progress && phase === "SUGGESTING" && (progress.suggestionTotal ?? 0) > 0 && (
          <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-700 ease-out"
              style={{ width: `${Math.round(((progress.suggestionCurrent ?? 0) / (progress.suggestionTotal ?? 1)) * 100)}%` }} />
          </div>
        )}
      </header>

      {/* --- Main area: fills rest of viewport --- */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: Thinking + Issues */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Thinking panel (summary streaming) */}
          <div className={`shrink-0 border-b overflow-y-auto ${hasSummary ? "max-h-[45%]" : ""}`}>
            {!hasSummary && phase === "FETCHING" && (
              <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                <svg className="h-4 w-4 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                正在获取 PR 代码和数据...
              </div>
            )}
            {!hasSummary && phase !== "FETCHING" && (
              <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                <svg className="h-4 w-4 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                AI 正在生成代码变更总结...
              </div>
            )}
            {hasSummary && (
              <div className="p-5">
                <div className="mb-2 flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${phase === "ANALYZING" || phase === "SUGGESTING" ? "bg-emerald-400" : "bg-indigo-500 animate-pulse"}`} />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {phase === "FETCHING" || !streamText ? "AI 分析中..." : phase === "SUGGESTING" ? "变更总结" : "AI 正在分析你的代码..."}
                  </h3>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {streamText}
                  {phase === "ANALYZING" && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-indigo-500 align-middle" />}
                </div>
              </div>
            )}
          </div>

          {/* Issue feed */}
          <div ref={issueFeedRef} className="flex-1 overflow-y-auto p-5">
            {!hasIssues && phase === "ANALYZING" && (
              <div className="flex items-center gap-3 py-8 text-sm text-muted-foreground justify-center">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                逐文件扫描风险中...
              </div>
            )}

            {hasIssues && (
              <div className="space-y-3 stagger">
                {allIssuesFlat.map((issue, i) => {
                  const cfg = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.LOW;
                  return (
                    <div
                      key={i}
                      className="group rounded-lg border border-border/40 bg-card p-4 transition-all hover:border-border hover:shadow-sm animate-fade-in-up"
                      style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: "both" }}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 text-sm">{cfg.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${cfg.bg} ${cfg.color}`}>
                              {issue.severity}
                            </span>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{issue.category}</span>
                            <span className="text-xs text-muted-foreground font-mono ml-auto">{issue.filePath}:{issue.lineStart}</span>
                          </div>
                          <p className="mt-1.5 text-sm font-medium">{issue.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{issue.description}</p>
                          {issue.suggestion && (
                            <div className="mt-2 text-xs text-indigo-600">
                              ✓ 修复建议已生成
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {isRunning && (
                  <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground justify-center">
                    <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {phase === "SUGGESTING" ? "生成修复建议中..." : "扫描更多文件中..."}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Stats sidebar */}
        <aside className="w-64 shrink-0 border-l bg-card/50 p-4 flex flex-col gap-4 overflow-y-auto">
          {/* Severity distribution */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">严重程度分布</h4>
            {severityGroups.length > 0 ? (
              <SeverityBar severityGroups={severityGroups} />
            ) : (
              <p className="text-xs text-muted-foreground">等待发现问题...</p>
            )}
          </div>

          {/* File progress */}
          {progress && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">分析进度</h4>
              <div className="text-2xl font-bold text-indigo-600">
                {phase === "SUGGESTING" ? (
                  <>{progress.suggestionCurrent ?? 0}<span className="text-sm font-normal text-muted-foreground">/{progress.suggestionTotal ?? 0}</span></>
                ) : (
                  <>{progress.analyzed}<span className="text-sm font-normal text-muted-foreground">/{progress.totalFiles}</span></>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {phase === "SUGGESTING" ? "条建议已生成" : "个文件已分析"}
              </p>
            </div>
          )}

          {/* Issue count */}
          {allIssuesFlat.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">发现问题</h4>
              <div className="text-2xl font-bold text-foreground">{allIssuesFlat.length}</div>
              <p className="text-xs text-muted-foreground mt-0.5">个潜在风险</p>
            </div>
          )}

          {/* Empty state hint */}
          {!progress && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-muted-foreground text-center">等待分析开始...</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

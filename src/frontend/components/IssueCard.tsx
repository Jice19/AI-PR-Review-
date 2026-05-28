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
    </div>
  );
}

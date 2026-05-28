// ========== 审查阶段类型 ==========

export type Layer = "frontend" | "backend" | "database" | "config";

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type ReviewStatus =
  | "PENDING"
  | "FETCHING"
  | "ANALYZING"
  | "SUGGESTING"
  | "COMPLETED"
  | "FAILED";

export type Decision = "APPROVE" | "COMMENT" | "REQUEST_CHANGES";

export type ReviewStageType =
  | "SUMMARY"
  | "BACKEND_SECURITY"
  | "BACKEND_LOGIC"
  | "BACKEND_PERFORMANCE"
  | "DATABASE"
  | "FRONTEND_SECURITY"
  | "FRONTEND_QUALITY"
  | "CONFIG";

export type StageStatus = "PASSED" | "WARNING" | "FAILED";

// ========== 问题类型 ==========

export type IssueCategory =
  // 后端
  | "INJECTION"
  | "AUTH"
  | "DATA_EXPOSURE"
  | "BUSINESS_LOGIC"
  | "INPUT_VALIDATION"
  | "RESOURCE"
  | "ERROR_HANDLING"
  | "PERFORMANCE"
  | "CONCURRENCY"
  // 数据库
  | "SCHEMA_DESTRUCTIVE"
  | "MISSING_INDEX"
  | "SQL_INJECTION"
  | "N_PLUS_ONE"
  | "QUERY_PERFORMANCE"
  | "TRANSACTION"
  | "CONNECTION"
  // 前端
  | "XSS"
  | "INFO_LEAK"
  | "STATE_MANAGEMENT"
  | "BOUNDARY"
  | "RENDER_PERFORMANCE"
  // 通用
  | "CODE_QUALITY"
  | "DEPENDENCY"
  | "CONFIG_MISMATCH";

export type IssueSource = "rule-engine" | "semgrep" | "llm";

export interface Suggestion {
  fixType: "CODE_CHANGE" | "ARCHITECTURE_CHANGE" | "ADD_VALIDATION" | "ADD_MIDDLEWARE";
  description: string;
  codeBefore: string;
  codeAfter: string;
  alternatives?: { approach: string; code: string }[];
  securityRationale?: string;
  rollback?: string;
  performanceImpact?: string;
}

export interface Issue {
  id: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  layer: Layer;
  severity: Severity;
  category: IssueCategory;
  title: string;
  description: string;
  codeSnippet: string;
  suggestion?: Suggestion;
  confidence: number;
  source: IssueSource;
  ruleId?: string;
}

// ========== 审查报告类型 ==========

export interface StageResult {
  stage: ReviewStageType;
  status: StageStatus;
  summary: string;
  score: number;
  issues: Issue[];
}

export interface ReviewSummary {
  title: string;
  summary: string;
  impact: string;
  focusAreas: string[];
  filesChanged: number;
  additions: number;
  deletions: number;
  layers: Record<Layer, number>;
}

export interface ReviewReport {
  id: string;
  prUrl: string;
  prTitle: string;
  repoName: string;
  branchFrom: string;
  branchTo: string;
  status: ReviewStatus;
  summary: ReviewSummary | null;
  stageResults: StageResult[];
  overallScore: number | null;
  decision: Decision | null;
  decisionReason: string | null;
  createdAt: string;
  fileCount: number;
  totalIssues: number;
}

// ========== 上下文类型 ==========

export interface FileContext {
  path: string;
  layer: Layer;
  diff: string;
  fullContent: string;
  additions: number;
  deletions: number;
  contentHash: string;
}

export interface RelatedContext {
  path: string;
  content: string;
  symbols: string[];
}

export interface ReviewContext {
  owner: string;
  repo: string;
  prNumber: number;
  prTitle: string;
  prDescription: string;
  branchFrom: string;
  branchTo: string;
  commits: { sha: string; message: string }[];
  files: FileContext[];
  relatedFiles: Record<string, RelatedContext[]>;
  projectConfig: {
    packageJson?: Record<string, unknown>;
    tsconfig?: Record<string, unknown>;
    eslintConfig?: Record<string, unknown>;
  };
}

// ========== 审查策略类型 ==========

export interface ReviewPolicyConfig {
  stages: ReviewStageType[];
  severityWeights: Record<string, number>;
  customRules?: Rule[];
  ignorePatterns: string[];
  minConfidence: number;
}

export interface Rule {
  id: string;
  category: IssueCategory;
  severity: Severity;
  message: string;
  pattern?: string;       // 正则表达式
  semgrepRule?: string;   // Semgrep 规则
}

// ========== 流式进度事件类型 ==========

export type StreamEventType =
  | "phase"
  | "summary"
  | "progress"
  | "file-complete"
  | "suggestion"
  | "error"
  | "complete";

export interface StreamEvent {
  type: StreamEventType;
  data: unknown;
}

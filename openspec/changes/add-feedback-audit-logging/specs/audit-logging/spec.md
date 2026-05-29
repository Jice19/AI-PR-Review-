## ADDED Requirements

### Requirement: LLM 调用自动记录审计日志
系统 SHALL 在每次 LLM API 调用完成后自动写入一条 AuditLog 记录，无论调用成功或失败。

#### Scenario: 成功调用写入日志
- **WHEN** LLM API 返回正常响应
- **THEN** 系统写入 AuditLog，success=true，包含 model、promptChars、responseChars、totalTokens、durationMs 字段

#### Scenario: 失败调用写入日志
- **WHEN** LLM API 抛出异常或超时
- **THEN** 系统写入 AuditLog，success=false，errorMsg 包含错误信息

### Requirement: 审计日志包含调用阶段标识
系统 SHALL 在 AuditLog.stage 字段中记录 LLM 调用的阶段：`summary`（总结生成）、`file-risk`（文件风险分析）或 `suggestion`（修复建议生成）。

#### Scenario: 记录调用阶段
- **WHEN** analyzeSummary 调用 LLM
- **THEN** AuditLog.stage = "summary"

### Requirement: 审计日志查询
系统 SHALL 提供按 Review ID 查询该次分析所有 LLM 调用记录的 API。

#### Scenario: 查询某次 Review 的审计日志
- **WHEN** 请求 GET /api/review/:id/audit-logs
- **THEN** 返回该 Review 的所有 AuditLog 记录，按 createdAt 升序排列

#### Scenario: 查询结果包含汇总信息
- **WHEN** 请求 GET /api/review/:id/audit-logs
- **THEN** 响应中包含 `{ logs: [...], summary: { totalCalls, totalTokens, totalDurationMs } }`

### Requirement: 审计日志写入不阻塞分析流程
系统 SHALL 采用 fire-and-forget 方式写入 AuditLog，审计写入失败时不影响分析流水线的正常执行。

#### Scenario: 写入失败时静默处理
- **WHEN** AuditLog 写入数据库失败
- **THEN** 系统 console.error 记录错误，但不向上抛出异常，分析流程继续

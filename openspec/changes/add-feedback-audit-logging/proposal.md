## Why

当前 AI Review 系统缺少质量反馈回路和调用审计能力。开发者看到 AI 报告的问题后，无法标记"有用"或"误报"；每次 LLM 调用的开销和细节也未追踪。持续改进分析质量必须依赖反馈数据，成本和安全审计则需要调用记录。

## What Changes

- 升级 `Feedback` 表为 `IssueFeedback`，增加三态反馈（有用/误报/待确认）、反馈人身份、评审备注
- 新增 `AuditLog` 表，记录每次 LLM 调用的模型、token 消耗、耗时、涉及文件数等元数据
- 新增对应的 API 端点：提交反馈、查询反馈统计、查询审计日志
- 前端 Issue 卡片增加 👍 👎 反馈按钮
- 后端 `llm.ts` 调用层在每次请求后写 AuditLog
- **BREAKING**: 删除原有 `Feedback` model，替换为 `IssueFeedback`（需迁移）

## Capabilities

### New Capabilities
- `issue-feedback`: 开发者对 AI 发现问题的三态反馈，支持反馈数据查询与统计
- `audit-logging`: LLM 调用审计日志，记录模型、token、耗时等，支持按 review 查询

### Modified Capabilities
无（现有逻辑不受影响，仅数据模型替换和新增）

## Impact

- 数据库：Prisma schema 修改（Feedback → IssueFeedback + 新增 AuditLog），需要生成迁移
- 后端：`llm.ts` 调用层增加审计写入；新增 feedback API 路由
- 前端：IssueCard 增加反馈按钮组，ReviewReport 无影响

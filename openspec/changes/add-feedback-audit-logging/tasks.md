## 1. 数据库

- [ ] 1.1 更新 Prisma schema：删除 Feedback model，新增 IssueFeedback model 和 FeedbackType enum，新增 AuditLog model
- [ ] 1.2 生成 Prisma 迁移并验证 `prisma migrate dev`

## 2. 后端 — 反馈 API

- [ ] 2.1 创建 `POST /api/issue/:id/feedback` 路由，支持 upsert 三态反馈
- [ ] 2.2 创建 `GET /api/review/:id/feedback-stats` 路由，返回按 feedback 类型分组的统计(useful/falsePositive/needsReview/total)

## 3. 后端 — 审计日志

- [ ] 3.1 在 `lib/llm.ts` 的 `callLLM` 和 `callLLMStream` 中添加审计写入逻辑，记录 model、promptChars、responseChars、totalTokens、durationMs、success、stage
- [ ] 3.2 审计写入采用 fire-and-forget 方式，失败不中断分析流程
- [ ] 3.3 创建 `GET /api/review/:id/audit-logs` 路由，返回该 review 的所有 LLM 调用记录及汇总(totalCalls/totalTokens/totalDurationMs)

## 4. 前端

- [ ] 4.1 IssueCard 增加三个反馈按钮（👍 有用 / 👎 误报 / 👀 待确认），点击提交并即时更新 UI
- [ ] 4.2 已反馈的 Issue 加载时展示已有选择状态

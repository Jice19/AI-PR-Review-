## Why

当前 PR Review 分析过程中用户看到的是空白 spinner，没有任何实时反馈，体验极差。用户无法感知 AI 分析进度，也不清楚系统是否在正常工作。分析完成后，issues 平铺展示缺乏层次感，且 IssueCard 不展示修复建议的代码对比，降低了 review 结果的可操作性。本次 MVP 解决这三个核心体验问题。

## What Changes

- **Token 级流式输出**：总结阶段 AI 生成的文本逐字推送到前端，用户可实时看到变更总结的生成过程
- **修复建议展示**：IssueCard 新增可折叠的 Before/After 代码对比区，展示 codeBefore、codeAfter 和 securityRationale
- **严重程度分组**：issues 按 CRITICAL → HIGH → MEDIUM → LOW 分组展示，每组显示问题数量
- 后端新增 SSE 端点 `GET /api/review/[id]/stream`，通过 `globalThis.__reviewStreams` 连接后台分析进程与 HTTP 响应
- callLLM 抽取 `parseLLMResponse` 通用解析，新增 `callLLMStream` 支持 streaming
- saveIssues 支持保存 `suggestion` JSON 字段

## Capabilities

### New Capabilities
- `streaming-review-output`: SSE 流式推送总结阶段的 AI 生成内容，前端实时逐字渲染
- `fix-suggestion-display`: IssueCard 展示可折叠的 Before/After 代码修复建议
- `severity-grouping`: Issues 按严重程度（CRITICAL/HIGH/MEDIUM/LOW）分组展示

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **Backend**: `src/backend/lib/llm.ts` (新增 callLLMStream + 抽取 parseLLMResponse), `src/backend/services/analyzer.ts` (新增 analyzeSummaryStream), `src/backend/services/review.ts` (SSE 集成 + suggestion 保存)
- **API**: 新增 `src/app/api/review/[id]/stream/route.ts` SSE 端点
- **Frontend**: `src/frontend/hooks/useReview.ts` (新增 useReviewStream hook), `src/frontend/components/ReviewReport.tsx` (流式面板 + 分组), `src/frontend/components/IssueCard.tsx` (修复建议展示)
- **No database migration required**: `ReviewIssue.suggestion Json?` 已存在

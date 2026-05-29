## Context

当前 PR Review 系统通过 `analyzePRInBackground` 异步执行三阶段分析（总结 → 文件风险 → 修复建议），前端通过 2 秒轮询 `/api/review/[id]` 获取结果。分析过程中用户只看到空白 spinner，体验差。

现有基础设施已具备：
- `StreamEvent` / `StreamEventType` 类型定义（`src/backend/types/index.ts:187-199`）
- `Suggestion` 类型定义（`src/backend/types/index.ts:63`）
- Prisma `ReviewIssue.suggestion Json?` 字段（`prisma/schema.prisma:82`），无需 migration
- `callLLM` 已使用 `AbortController` 实现超时控制

约束：
- DeepSeek API 支持 `stream: true` 参数
- Next.js App Router 原生支持 `ReadableStream` 作为 Response body
- 前端需兼容 `fetch + ReadableStream.getReader` 解析 SSE

## Goals / Non-Goals

**Goals:**
- 总结阶段（Stage 1）实现 token 级流式输出，用户实时看到 AI 生成的 markdown 文本
- IssueCard 展示 codeBefore/codeAfter 代码对比和安全理由
- Issues 按严重程度 CRITICAL → HIGH → MEDIUM → LOW 分组展示

**Non-Goals:**
- 文件分析阶段（Stage 2）逐 token 流式 —— 太复杂，MVP 只做"知道分析中"的阶段提示
- 修复建议阶段（Stage 3）逐 token 流式 —— 非核心体验
- 取消/暂停分析功能
- 多用户并发 streaming 的复杂管理

## Decisions

### 1. SSE over `globalThis` vs Redis/MQ

**选择**: `globalThis.__reviewStreams` (in-memory Map)

**原因**:
- 单进程 Next.js 部署，无横向扩展需求
- 无额外依赖，实现极简
- `ReadableStreamController` 天然支持 `cancel()` 回调清理

**备选**: Redis pub/sub 或 RabbitMQ —— 增加运维复杂度，MVP 不需要。

### 2. SSE vs WebSocket

**选择**: SSE (Server-Sent Events)

**原因**:
- 单向流（server → client），无需双向通信
- 浏览器原生 `EventSource` API 兼容，无需额外库
- Next.js Route Handler 原生支持 `ReadableStream`

**备选**: WebSocket 需要额外升级处理，MVP 过度设计。

### 3. 流式仅覆盖总结阶段

**选择**: 只有 `analyzeSummaryStream`（Stage 1）逐 token 流式输出

**原因**:
- 总结是最先产出且用户最关心的内容（3-5 句变更总结）
- Stage 2 文件分析是批量并行调用，token 交织问题复杂
- Stage 3 修复建议数量多，streaming 实现复杂度高但体验收益低

### 4. parseLLMResponse 抽取为独立函数

**选择**: 从 `callLLM` 中抽取 JSON 提取和解析逻辑为 `parseLLMResponse<T>()`

**原因**: `callLLM` 和 `callLLMStream` 都需 JSON 解析，避免重复代码。

### 5. saveIssues 增加 suggestion 参数

**选择**: 直接给 `saveIssues` 的 issues 数组增加可选 `suggestion` 字段，映射到 Prisma `Json?` 列

**原因**: Prisma schema 已有 `suggestion Json?`，只需填充数据。

## Risks / Trade-offs

- **[单点故障]** `globalThis.__reviewStreams` 在进程重启后丢失 → 前端检测 SSE 断开后回退到轮询模式
- **[内存泄漏]** 如果客户端断开但未触发 `cancel()` → 定时清理（5 分钟 TTL）未关闭的 controller
- **[Partial 内容回退]** 如果 SSE 连接失败或浏览器不支持 → 前端静默降级到纯轮询模式，不显示流式文本

## Migration Plan

1. 部署后，新提交的 PR Review 自动走 SSE streaming 路径
2. 已完成的 Review 不受影响（只读）
3. 回滚：移除 SSE 端点即可，`analyzePRInBackground` 降级为非流式调用（保留 `analyzeSummary` 旧函数）

## Open Questions

- (none for MVP)

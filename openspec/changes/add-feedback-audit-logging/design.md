## Context

当前 `Feedback` 模型仅支持 `isAccurate` 布尔值和 `comment` 文本，无法区分"有用"、"误报"、"需进一步评审"三种关键反馈类型，也未记录反馈人。LLM 调用层面没有任何审计记录，无法追踪单次分析的 API 开销。

数据库使用 PostgreSQL，ORM 为 Prisma。后端 API 路由为 Next.js Route Handler，前端为 React Server Components + Client Components。

## Goals / Non-Goals

**Goals:**
- 将 Feedback 升级为三态模型（USEFUL / FALSE_POSITIVE / NEEDS_REVIEW），记录反馈人
- 提供反馈统计 API，按规则、严重程度、时间段等维度聚合
- 每次 LLM 调用自动写入 AuditLog（模型、token、耗时、涉及文件数）
- 前端 Issue 卡片加反馈按钮，提交后即时更新状态

**Non-Goals:**
- 不做基于反馈数据的自动规则调优（那是 Phase 2 的事）
- 不做 AuditLog 的数据保留策略（PII 过滤等 E 方案在后续实现）
- 不改变现有 Review/Issue 的创建和查询逻辑

## Decisions

### D1: Feedback 模型设计

选择 **三态枚举** 而非布尔值：

```prisma
model IssueFeedback {
  id        String   @id @default(uuid())
  issueId   String
  feedback  FeedbackType  // USEFUL | FALSE_POSITIVE | NEEDS_REVIEW
  comment   String?  @db.Text
  createdBy String                                     // GitHub 用户名
  createdAt DateTime @default(now())

  issue ReviewIssue @relation(fields: [issueId], references: [id], onDelete: Cascade)
}

enum FeedbackType {
  USEFUL
  FALSE_POSITIVE
  NEEDS_REVIEW
}
```

**为什么不复用原有 `isAccurate: Boolean`？** — 布尔值无法区分"AI 判断正确但描述不清"和"AI 完全判断错误"。三态更精准，便于后续统计误报率。

### D2: AuditLog 写入时机

LLM 调用后**立即写入**，而非批量写入：

- 每个 LLM 请求独立一行，即使同一 Review 有多次调用
- 写入操作在后台进行，不阻塞分析流水线（fire-and-forget）
- 如果写入失败，仅 `console.error` 记录，不中断分析

```prisma
model AuditLog {
  id            String   @id @default(uuid())
  reviewId      String
  model         String   // deepseek-v4-flash | deepseek-v4-pro
  stage         String   // summary | file-risk | suggestion
  promptChars   Int      // 发送字符数
  responseChars Int      // 接收字符数
  totalTokens   Int?     // API 返回的总 token
  durationMs    Int      // 耗时毫秒
  fileCount     Int?     // 涉及文件数（file-risk 阶段）
  success       Boolean  // 是否成功
  errorMsg      String?  @db.Text
  createdAt     DateTime @default(now())

  review Review @relation(fields: [reviewId], references: [id], onDelete: Cascade)

  @@index([reviewId])
  @@index([createdAt])
  @@index([model])
}
```

### D3: 前端反馈交互

在 `IssueCard` 组件内增加三个按钮：

```
[👍 有用] [👎 误报] [👀 待确认]
```

- 点击即提交，无需额外确认
- 提交后该 Issue 的所有按钮变为灰色禁用态，已选项高亮
- API 调用 `POST /api/issue/:id/feedback`，body: `{ feedback: "USEFUL" }`

## Risks / Trade-offs

- **Feedback 表无需鉴权字段**：当前 `createdBy` 仅存 GitHub 用户名，不做权限校验。风险：任何人可提交反馈。→ 当前阶段可接受，后续通过 session 校验。
- **AuditLog 写入可能影响延迟**：每个 LLM 调用后额外一次 DB 写入。→ 用 `prisma.auditLog.create()` 异步 fire-and-forget，异常静默处理。
- **迁移破坏现有 Feedback 数据**：旧 `Feedback` 表删除。→ 当前数据量小（未上线），直接迁移无需数据保留。

## Migration Plan

1. 创建 Prisma 迁移文件
2. 部署时先运行 `prisma migrate deploy`
3. 旧 `Feedback` 数据不作保留（当前无实际数据）
4. 回滚：恢复旧 migration 即可

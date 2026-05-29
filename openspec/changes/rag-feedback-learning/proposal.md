## Why

AI Review 系统已收集用户反馈（有用/误报/待确认），但这些数据目前仅存储，未用于提升分析质量。每次分析时 LLM 没有历史反馈的上下文，会重复犯同样的错误（如持续误报同类型代码）。需要通过 RAG（检索增强生成）机制，将历史反馈作为语义相似案例注入分析 prompt，让 LLM 根据用户实际偏好持续优化。

## What Changes

- 启用 PostgreSQL `pgvector` 扩展，新增 `FeedbackVector` 表存储反馈代码片段的向量
- 新增 `embedding.ts` 库，对接阿里云百炼的 `tongyi-embedding-vision-plus` 模型
- 新增 `feedback-learner.ts` 服务：写入时向量化反馈，分析时检索相似案例
- 修改 `analyzer.ts` 的 `analyzeFileRisk()`，将 RAG 检索结果注入 prompt 作为少样本示例
- 修改 `review.ts` 的 `analyzePRInBackground()`，分析前预热 RAG 检索
- 修改 feedback API，提交反馈时异步写入向量库

## Capabilities

### New Capabilities
- `rag-feedback`: 基于用户反馈的 RAG 检索增强，将历史反馈案例注入 LLM 分析 prompt

### Modified Capabilities
- `issue-feedback`: 提交反馈时自动向量化代码片段并存入 pgvector

## Impact

- 数据库：需启用 pgvector 扩展，新增 `FeedbackVector` 表，新增迁移
- 后端：新增 embedding 调用库、feedback-learner 服务，修改 analyzer/review 流程
- 前端：无变动
- 环境变量：新增 `BAILIAN_API_KEY`、`BAILIAN_EMBEDDING_MODEL`

## 1. 基础设施 — pgvector 扩展

- [ ] 1.1 检查并启用 pgvector 扩展：`CREATE EXTENSION IF NOT EXISTS vector;`
- [ ] 1.2 创建 migration SQL：FeedbackVector 表 + HNSW 索引

## 2. Embedding 客户端

- [ ] 2.1 创建 `src/backend/lib/embedding.ts`，封装阿里云百炼 embedding API（兼容 OpenAI SDK）
- [ ] 2.2 支持批量嵌入 `embed(texts: string[]): Promise<number[][]>`
- [ ] 2.3 环境变量：`.env.example` 增加 `BAILIAN_API_KEY`、`BAILIAN_EMBEDDING_MODEL`

## 3. RAG 反馈学习服务

- [ ] 3.1 创建 `src/backend/services/feedback-learner.ts`
- [ ] 3.2 实现 `embedFeedback(issueId, codeSnippet, feedback, layer, category, severity)`：嵌入 + 写入 FeedbackVector
- [ ] 3.3 实现 `searchSimilarFeedback(codeSnippet: string, layer: string): Promise<{positive: FeedbackExample[], negative: FeedbackExample[]}>`：向量检索
- [ ] 3.4 实现 `buildFeedbackPromptSection(examples): string`：将检索结果格式化为 prompt 注入文本

## 4. 修改反馈 API

- [ ] 4.1 修改 `POST /api/issue/:id/feedback`，提交成功后异步调用 `embedFeedback()`

## 5. 修改分析流水线

- [ ] 5.1 修改 `analyzer.ts` 的 `analyzeFileRisk()`：新增 `feedbackExamples` 参数，注入 prompt
- [ ] 5.2 修改 `review.ts` 的 `analyzePRInBackground()`：文件分析前调用 `searchSimilarFeedback()` 并传入 `analyzeFileRisk()`

## 6. 环境变量与配置

- [ ] 6.1 `.env.example` 增加百炼 embedding 相关配置

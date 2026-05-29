## Context

当前 `IssueFeedback` 表已存储用户反馈，但反馈数据未参与分析流程。需要将反馈数据向量化后用于 RAG 检索，在每次文件分析时检索语义相似的历史案例，注入 prompt 指导 LLM。

Embedding 模型选用阿里云百炼平台的 `tongyi-embedding-vision-plus-2026-03-06`，该模型支持代码理解，且 API 兼容 OpenAI 格式。向量存储使用 PostgreSQL 的 `pgvector` 扩展（项目已使用 PG，无需额外服务）。

## Goals / Non-Goals

**Goals:**
- 用户提交反馈时，自动将 issue 的 codeSnippet 向量化并存入 pgvector
- 分析新代码时，检索语义最相似的历史反馈案例（区分正面/负面）
- 将检索结果注入 `analyzeFileRisk` 的 prompt，指导 LLM 学习用户偏好
- 每个 layer 独立检索，提高匹配精度

**Non-Goals:**
- 不做在线学习（实时更新模型权重）
- 不做反馈的批量导出或 fine-tuning 数据准备
- 不改变现有 issue-feedback API 的对外行为（只在写入后追加向量化步骤）

## Decisions

### D1: Embedding 模型选择

使用 **阿里云百炼 `tongyi-embedding-vision-plus-2026-03-06`**：

- API 兼容 OpenAI 格式，直接使用项目已有的 `openai` SDK
- Base URL: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- 向量维度: 1024（该模型标准输出）
- 价格远低于 OpenAI embedding，且支持中英文代码混合场景

```typescript
// src/backend/lib/embedding.ts
const embeddingClient = new OpenAI({
  apiKey: process.env.BAILIAN_API_KEY,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

async function embed(texts: string[]): Promise<number[][]> {
  const res = await embeddingClient.embeddings.create({
    model: process.env.BAILIAN_EMBEDDING_MODEL,
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}
```

### D2: 向量存储模型

```prisma
model FeedbackVector {
  id            String   @id @default(uuid())
  issueId       String   @unique   // 关联 ReviewIssue
  feedback      FeedbackType       // USEFUL | FALSE_POSITIVE
  codeSnippet   String             // 被标记的代码片段（原始文本，用于展示）
  embedding     Unsupported("vector(1024)")  // pgvector 向量（Prisma 不直接支持，用 raw SQL）
  layer         String             // backend | frontend | database | config
  category      String             // SQL_INJECTION | XSS | etc
  severity      String             // CRITICAL | HIGH | MEDIUM | LOW
  createdAt     DateTime @default(now())

  @@index([layer])
  @@index([feedback])
}
```

**注意**：Prisma 不原生支持 pgvector 类型，`embedding` 列和索引需通过 raw migration SQL 创建。写入/检索时使用 `prisma.$queryRaw`。

### D3: RAG 检索策略

- **检索时机**：`analyzeFileRisk()` 执行前，用当前文件的 diff/codeSnippet 作为 query
- **相似度度量**：余弦距离（`<=>` operator in pgvector）
- **检索范围**：同一 layer 的历史反馈，优先匹配代码模式相似的
- **数量限制**：正例（USEFUL）取 top-3，负例（FALSE_POSITIVE）取 top-3
- **兜底**：向量库为空或相似度 < 0.7 时，不注入（不污染 prompt）

### D4: 反馈写入时机

提交反馈时**先写入** `IssueFeedback` 表，**再异步**（fire-and-forget）向量化并写入 `FeedbackVector`：

```
POST /api/issue/:id/feedback
  → upsert IssueFeedback（同步，必须成功）
  → embed(codeSnippet) + insert FeedbackVector（异步，失败不阻塞）
```

这样即使 embedding API 挂了，也不影响用户提交反馈的核心流程。

### D5: Prompt 注入格式

在 `analyzeFileRisk()` 的 prompt 末尾追加：

```
## 历史反馈学习
以下是根据相似代码检索到的历史反馈，供你参考：

### 用户确认有用的发现（请保持类似的判断标准）
- ✅ [SQL_INJECTION] 用户输入的字符串直接拼接到 SQL 查询中
  代码: `SELECT * FROM users WHERE id = '${userId}'`
  反馈: 用户标记为有用

### 用户标记为误报（请不要报告类似的问题）
- ❌ [DATA_EXPOSURE] ORM 查询结果在日志中打印
  代码: `console.log(user)` // user is ORM result
  反馈: 用户标记为误报，实际为调试代码
```

## Risks / Trade-offs

- **embedding API 延迟**：每次反馈提交多一次 API 调用。→ fire-and-forget，不阻塞。
- **embedding API 费用**：每次嵌入约 0.0005 元。→ 仅对用户实际反馈的 issue 做嵌入，量很小。
- **冷启动**：初期无反馈数据时 RAG 无结果。→ 保持现有 prompt 不变，RAG 仅作为增强。
- **pgvector 索引性能**：HNSW 索引构建需要时间。→ 万条以内无需索引，直接全量扫描即可。

## Migration Plan

1. 数据库：`CREATE EXTENSION IF NOT EXISTS vector;` 启用 pgvector
2. 创建 `FeedbackVector` 表（含 vector 列和 HNSW 索引）
3. 部署前设置 `BAILIAN_API_KEY` 环境变量
4. RAG 功能默认开启，无向量数据时自动降级（不注入 prompt）
5. 回滚：删除 `FeedbackVector` 表即可，不影响其他功能

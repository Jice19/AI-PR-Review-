# AI PR Review 助手 — 设计思路说明

## 1. 模型选择

### 1.1 为什么选择 DeepSeek

本系统选用 DeepSeek API 作为唯一的 LLM 后端，基于以下考量：

| 维度 | 选型理由 |
|------|---------|
| **性价比** | DeepSeek 的推理成本约为 GPT-4 的 1/10，Flash 模型对简单扫描任务成本极低，适合大批量文件分析场景 |
| **中文能力** | DeepSeek 在中文技术文档理解、中文注释阅读、中文 issue 描述方面表现优于同价位竞品 |
| **API 兼容性** | 完全兼容 OpenAI SDK 格式，迁移成本为零，未来可无缝切换到任何 OpenAI-compatible 的后端 |
| **思考模式 (Thinking)** | `deepseek-v4-pro` 支持 reasoning token 输出，对复杂的安全漏洞分析能给出推理链条，提升准确性 |

### 1.2 Flash / Pro 双模型分工策略

系统采用**任务分层**策略，不同复杂度的任务使用不同能力的模型：

```
┌─────────────────────────────────────────────┐
│                  DeepSeek V4                 │
├─────────────────┬───────────────────────────┤
│   Flash (快速)   │       Pro (深度)           │
│   ~高并发/低成本  │       ~推理/高准确性        │
├─────────────────┼───────────────────────────┤
│ • 逐文件风险扫描  │ • PR 变更总结               │
│   (可大批量并发)  │ • 复杂安全漏洞分析           │
│ • 修复建议生成    │ • 架构层面的风险评估         │
│ • 代码模式匹配    │                           │
└─────────────────┴───────────────────────────┘
```

**Flash 适用场景特征**：任务结构明确、输出格式固定 (JSON Schema)、每文件独立、量大但单次简单。Flash 的低延迟 (<2s per file) 是保证 10 个文件以内 PR 在 30s 内完成分析的关键。

**Pro 适用场景特征**：需要跨文件推理、需要深入理解业务逻辑、需要生成高质量的总结文本。Pro 的 thinking 模式会先进行内部推理再输出，虽然耗时较长 (10-30s) 但准确率显著高于 Flash。

### 1.3 超时与容错设计

- **90s 硬超时**：使用 `AbortController` 而非 SDK 内置 timeout（因为 DeepSeek 的 server-sent timeout 机制与 OpenAI 不完全一致，SDK timeout 有时不生效）
- **Fire-and-forget 审计日志**：每次 LLM 调用异步写入 `AuditLog`，不阻塞主流程，积累数据后可做成本分析和模型效果对比
- **空响应处理**：DeepSeek thinking 模式下偶发 reasoning 后不输出 content，检测到后抛友好错误

### 1.4 Embedding 模型选择

选用阿里云百炼 `tongyi-embedding-vision-plus` (1024 维)，原因：
- pgvector 对 1024 维向量索引性能好，1024 是性价比最优维度
- 百炼模型对中英文混合代码片段的支持优于 OpenAI text-embedding-3
- 独立于 DeepSeek API，避免单一供应商锁定

---

## 2. 上下文获取方式

### 2.1 三层上下文架构

```
Layer 1: PR 元信息          Layer 2: 文件级上下文        Layer 3: 项目级上下文
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ • PR title        │    │ • 变更文件的 diff  │    │ • 关联文件(imports)│
│ • PR description  │    │ • 完整文件内容     │    │ • package.json    │
│ • Commit history  │    │ • 文件层级分类     │    │ • tsconfig.json   │
│ • Branch info     │    │ • 增删行数统计     │    │ • 项目目录结构     │
└──────────────────┘    └──────────────────┘    └──────────────────┘
     GitHub REST API         GitHub REST API         import 解析 + API
```

### 2.2 关联文件发现策略

`ContextBuilder` 使用**轻量正则解析**而非完整 AST 来提取 import 语句：

```
文件变更 → 提取 import/require 语句 → 解析路径别名 (@/) → 从 GitHub 获取关联文件内容
```

**为什么不用 AST 解析？**
- PR 中的文件可能处于不完整状态（编译不通过），AST 解析会失败
- 正则匹配对 TypeScript/JavaScript 的 import 语句覆盖率高 (95%+)
- 速度快，每次分析即可构建完整的关联上下文，无需预处理

**关联文件截断策略**：当前限制为 10 个关联文件，按首次发现顺序截取。这里选择广度优先是为了覆盖尽可能多的依赖方向，而非陷入某个深层依赖链。

### 2.3 文件层级分类

系统按预定义规则将文件分为四个层级，每个层级有独立的审查 prompt：

| 层级 | 判定依据 | 审查侧重 |
|------|---------|---------|
| `frontend` | `.tsx/.jsx/.css` 文件或位于 `components/pages/hooks` 目录 | XSS、信息泄露、状态管理 |
| `backend` | `.ts/.js` 文件或位于 `services/controllers/middlewares` 目录 | SQL注入、认证授权、并发安全 |
| `database` | `.prisma/.sql` 文件或 `migrations/models` 目录 | 破坏性迁移、索引缺失、N+1 |
| `config` | `.yaml/.json/Dockerfile/.github` 目录 | 配置错误、环境变量泄露 |

---

## 3. RAG 反馈学习系统

### 3.1 闭环设计

```
用户标记反馈(USEFUL/FALSE_POSITIVE)
       ↓
   codeSnippet + feedback → Embedding API → pgvector 写入
       ↓
   下次分析相似代码时检索历史案例 → 注入 prompt
       ↓
   LLM 参考历史正确案例 + 避免历史误报模式 → 降低误报率
```

### 3.2 检索策略

- **按 layer 过滤**：同层级的反馈案例比跨层级的相关性更高
- **双通道检索**：同时检索 USEFUL 和 FALSE_POSITIVE 案例，正面案例告诉 LLM "这个问题确实值得报"，反面案例告诉 LLM "这个模式可能不是问题"
- **相似度阈值 0.7**：余弦相似度低于 0.7 的案例不注入 prompt，防止噪声干扰

---

## 4. 未来扩展方向

### 4.1 短期（1-2 月）

- **Semgrep 规则引擎集成**：在 LLM 之前先跑 Semgrep 静态分析，确定性的问题（如 `dangerouslySetInnerHTML`）不需要浪费 token
- **增量 Review**：`synchronize` 事件时仅分析变更的 commit diff，而非全量重跑
- **Review 历史对比**：两次 PR review 之间的 issue 变化趋势，帮助团队追踪代码质量改进

### 4.2 中期（3-6 月）

- **Monorepo 感知**：基于 `turbo.json`/`nx.json` 识别 monorepo 边界，按 package 维度而非文件维度分析
- **自定义规则 DSL**：允许团队用 yaml 定义项目特定的安全规则和编码规范
- **行级 PR Comment**：在 PR 的 diff 视图而非顶层 issue comment 中标记问题，支持 review 标准工作流
- **多模型 A/B 评估**：用 AuditLog 数据对 Flash vs Pro 进行准确率对比，量化模型选择收益

### 4.3 长期（6-12 月）

- **跨 PR 影响分析**：检测多个 PR 之间的冲突和集成风险
- **知识图谱构建**：从代码仓库历史中学习模块间依赖关系，做更精准的影响面评估
- **自演进审查策略**：基于团队反馈的统计分布自动调优审查维度的权重和阈值

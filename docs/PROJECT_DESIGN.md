# AI PR Review 助手 — 项目设计文档

## 一、项目概述

### 1.1 产品定位

AI PR Review 助手是一个基于大语言模型的代码评审工具，帮助开发团队提升 Pull Request 的 Review 效率与质量。用户指定 GitHub PR 后，系统自动获取代码变更，按规范化的审查流程进行多维度分析，输出结构化的 Review 报告。

### 1.2 核心价值

| 痛点 | 解决方案 |
|------|---------|
| 大 PR 人工 review 耗时数小时 | AI 30 秒内完成全量初筛 |
| Reviewer 不了解变更的上下游上下文 | 自动获取关联文件，构建完整上下文 |
| 长 review session 后期疲劳遗漏 | 7 维度逐项检查，不遗漏 |
| 大量时间花在风格问题，忽略安全隐患 | 安全 > 逻辑 > 性能 > 风格，按严重程度分级 |
| Review 质量因人而异 | 标准化流程 + 可量化评分 |

### 1.3 产品形态

Web 应用，看板式 Dashboard + 分栏式 Diff 视图的组合体验：

- **主流程**：输入 PR URL → 流式分析 → 看板展示综合评分和各阶段结果
- **详情查看**：点击具体问题 → 滑入分栏视图，左侧代码 diff + 右侧分析意见
- **历史管理**：历史记录列表，支持按 repo / 时间 / 状态搜索过滤

---

## 二、技术架构

### 2.1 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 框架 | Next.js 14 (App Router) | 全栈一体化，API Routes 兼做后端 |
| 语言 | TypeScript | 类型安全，前后端统一 |
| UI | React + Tailwind CSS + shadcn/ui | 组件丰富，快速出 UI |
| 数据库 | PostgreSQL + Prisma ORM | 结构化数据，支持 JSON 字段存分析结果 |
| 缓存 | Redis | API 限流、分析结果缓存 |
| 认证 | NextAuth.js + GitHub OAuth | 绑定 GitHub 身份，API 限流 |
| AI 平台 | DeepSeek API | 性价比优秀的代码分析能力 |
| AI SDK | openai (兼容模式) | DeepSeek 兼容 OpenAI API 格式 |
| GitHub | octokit (官方 JS SDK) | 获取 PR diff、文件内容、commit 历史 |
| 部署 | Docker / Vercel | 按需选择 |

### 2.2 模型选择

| 阶段 | 模型 | 模式 | 理由 |
|------|------|------|------|
| Stage 1: 变更总结 | `deepseek-v4-flash` | 非思考 | 摘要类任务，无需深度推理，Flash 2-4s 完成 |
| Stage 2: 风险识别 | `deepseek-v4-pro` | 思考模式 | 分析质量的核心，需要理解语义、追溯调用链、区分真/假问题 |
| Stage 3: 建议生成 | `deepseek-v4-flash` | 非思考 | 针对已知问题生成修复代码，偏补全而非推理 |

> DeepSeek V4 系列（2026 年 4 月发布）:
> - `deepseek-v4-flash`: 284B 参数 (13B 激活), 1M 上下文, $0.28/M 输出
> - `deepseek-v4-pro`: 1.6T 参数 (49B 激活), 1M 上下文, $0.87/M 输出
> - 两模型均通过参数切换思考模式，旧模型名 (`deepseek-chat` / `deepseek-reasoner`) 将于 2026/07/24 废弃

### 2.3 系统架构图

```
┌──────────────────────────────────────────────────────────┐
│                       Web 前端 (React)                     │
│   Dashboard 看板  │  Diff 分栏视图  │  历史记录  │  设置    │
├──────────────────────────────────────────────────────────┤
│                  Next.js API Routes (SSE 流式)             │
├──────────────────────────────────────────────────────────┤
│                         服务层                             │
├──────────┬──────────┬──────────┬──────────┬─────────────┤
│ Context  │  Rule    │ Semgrep  │  LLM     │  Report     │
│ Builder  │ Engine   │ Scanner  │ Pipeline │  Builder    │
├──────────┴──────────┴──────────┴──────────┴─────────────┤
│                    数据 & 基础设施                          │
├──────────┬──────────┬──────────┬─────────────────────────┤
│PostgreSQL│  Redis   │  GitHub  │  DeepSeek API           │
│(Prisma)  │ (Cache)  │  API     │  (openai SDK)           │
└──────────┴──────────┴──────────┴─────────────────────────┘
```

---

## 三、规范化 Review 流程

### 3.1 流程总览

```
用户输入 PR URL → GitHub API 获取数据 → 上下文构建 →
  规则引擎预扫 → AI 三阶段分析 → 结果聚合 → 报告输出 → 反馈闭环
```

### 3.2 三阶段分析流水线

```
Raw Context (diff + files + commits)
        │
        ▼
┌─────────────────────┐
│  Stage 1: PR 变更总结 │  模型: deepseek-v4-flash
│  输入: PR 元信息      │  延迟: 2-4s
│      + 文件列表       │  产出: 3-5 句变更摘要 + 影响面 + Review 重点
│      + commits        │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Stage 2: 风险代码识别 │  模型: deepseek-v4-pro (思考模式)
│  输入: diff + 全文     │  延迟: 5-15s/文件 (并行)
│      + 关联上下文      │  产出: 结构化问题清单
│  按文件切片，并行分析   │        (严重程度 + 分类 + 行号 + 置信度)
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Stage 3: Review 建议 │  模型: deepseek-v4-flash
│  输入: 问题 + 代码上下文│  延迟: 2-5s/问题
│  对 CRITICAL/HIGH 问题 │  产出: diff 格式修复代码 + 替代方案
│  逐条生成修复方案      │
└─────────────────────┘
```

### 3.3 全栈分层审查维度

文件按类型自动路由到对应审查策略：

#### 后端 (controllers, services, middleware)

| 严重程度 | 类别 | 检查项 |
|---------|------|--------|
| CRITICAL | 注入攻击 | SQL 注入、命令注入、模板注入 |
| CRITICAL | 认证授权 | 缺失权限检查、越权风险、middleware 顺序错误 |
| HIGH | 敏感数据 | 异常堆栈泄露、日志打印敏感信息、响应返回不应暴露的字段 |
| HIGH | 业务逻辑 | 关键操作幂等性、竞态条件、状态机不完整 |
| HIGH | 输入校验 | 参数类型/范围/格式校验缺失、深度校验缺失 |
| HIGH | 资源安全 | 文件上传未校验、SSRF、循环中 await 雪崩 |
| MEDIUM | 错误处理 | 未捕获 Promise rejection、空 catch 块 |
| MEDIUM | 性能 | 循环中调外部服务、不必要深拷贝 |
| MEDIUM | 并发控制 | 共享状态无锁保护 |

#### 数据库 (SQL, ORM models, migrations)

| 严重程度 | 类别 | 检查项 |
|---------|------|--------|
| CRITICAL | Schema 破坏 | DROP TABLE/COLUMN、修改列类型、删除外键 |
| CRITICAL | SQL 注入 | 字符串拼接 SQL、动态表名无白名单、raw query 未参数化 |
| HIGH | 查询性能 | SELECT * 无 LIMIT、N+1 查询、大偏移量分页 |
| HIGH | 索引缺失 | 新表/新列无索引、JSON 列做频繁查询 |
| HIGH | 危险操作 | 无 WHERE 的 DELETE/UPDATE |
| MEDIUM | 事务安全 | 事务中调外部服务、缺少 rollback、连接泄漏 |

#### 前端 (components, hooks, pages)

| 严重程度 | 类别 | 检查项 |
|---------|------|--------|
| CRITICAL | XSS | dangerouslySetInnerHTML / v-html、用户输入直接渲染 |
| CRITICAL | 信息泄露 | 前端硬编码密钥、console.log 敏感信息、.map 文件泄露 |
| HIGH | 状态管理 | useEffect 依赖缺失、组件卸载后 setState、过期闭包 |
| HIGH | 边界条件 | 未处理 loading/error/empty 状态 |
| MEDIUM | 渲染性能 | 未 memo 的计算密集组件、列表 key 用 index |
| MEDIUM | 资源清理 | useEffect 定时器未清理、事件监听未移除 |

#### 配置文件 (Docker, K8s, CI/CD)

| 严重程度 | 类别 | 检查项 |
|---------|------|--------|
| CRITICAL | 端口暴露 | 不必要的端口映射、敏感服务暴露 |
| HIGH | 权限过大 | 容器 root 运行、过度 RBAC 权限 |
| MEDIUM | 镜像安全 | 基础镜像版本过旧、多阶段构建缺失 |

### 3.4 修复建议生成

每个风险发现附带可执行的修复方案：

```
报告中的问题结构:
{
  severity: "CRITICAL",
  category: "SQL_INJECTION",
  filePath: "src/services/user.ts",
  lineStart: 42,
  confidence: 0.96,
  title: "SQL 注入风险：用户输入直接拼接到 raw query",
  codeSnippet: "db.raw(`SELECT * FROM users WHERE id = '${userId}'`)",
  suggestion: {
    codeBefore: "db.raw(`SELECT * FROM users WHERE id = '${userId}'`)",
    codeAfter: "db.raw('SELECT * FROM users WHERE id = ?', [userId])",
    alternatives: [
      "使用 ORM: db.select().from(users).where(eq(users.id, userId))"
    ],
    securityRationale: "参数化查询将 SQL 逻辑与数据分离，从根本上防止注入"
  }
}
```

### 3.5 Review Decision

流程终点输出明确结论：

```
综合评分: 72/100

后端安全    45  ❌ FAILED  (1 CRITICAL)
后端逻辑    80  ✅ PASSED
数据库      65  ⚠️  WARNING
前端安全    85  ✅ PASSED
前端质量    70  ✅ PASSED

结论: REQUEST_CHANGES
原因: 存在安全红线问题（SQL 注入），需修复后重新提交
```

### 3.6 可配置的审查策略

不同团队可自定义审查规则集：

```typescript
interface ReviewPolicy {
  name: string;
  stages: ReviewStage[];
  severityWeights: Record<string, number>;
  customRules?: Rule[];
  ignorePatterns?: string[];
  minConfidence: number;
}
```

---

## 四、上下文管理

### 4.1 上下文包含内容

| 数据类型 | 用途 |
|---------|------|
| PR 元信息 (标题、描述、分支) | 生成变更总结 |
| git diff (patch) | 核心分析输入 |
| 变更文件全文 | 理解完整逻辑 |
| 关联文件 (import 链上游的类型/函数定义) | 跨文件分析，降低误报 |
| 项目结构快照 (文件树、关键 config) | 架构审查 |
| commit 历史 | 变更意图理解 |

### 4.2 关联上下文获取策略

```
文件 src/services/user.ts 变更
  → AST 解析 import 语句
  → 筛出项目内部 import (非 node_modules)
  → import { User, UserRole } from '@/types/user'
  → GitHub API 获取源文件
  → 提取 User, UserRole 的类型/接口定义
  → 注入到 prompt 的 "关联上下文" 部分
```

### 4.3 存储方案

```
PostgreSQL (热数据) — Review 元信息、文件索引、问题记录、反馈数据
文件系统/对象存储 (冷数据) — diff、文件快照、组装后的 prompt

存储结构:
  storage/reviews/{review_id}/
  ├── meta.json          # PR 原始元信息
  ├── diff.patch         # 原始 git diff
  ├── files/             # 变更文件全文快照
  ├── related/           # 关联文件快照
  ├── context.json       # 组装后的完整上下文结构
  └── prompt.md          # 发送给 LLM 的完整 prompt (可复现/调试)

生命周期:
  active  (分析完成后)   → 完整保留
  archive (30 天后)      → 删除文件快照，保留元信息 + 问题记录
  purge   (90 天后)      → 仅保留 Review + ReviewIssue (统计用)
```

### 4.4 缓存策略

基于 contentHash 的缓存失效：

```
GitHub 取文件 → 算 SHA → 查 DB 是否已有同 hash 的 ContextFile
  → 有：复用已有分析结果
  → 无：写入新快照 + 重新分析

三级缓存:
  L1 内存    → 同进程重复请求，0ms
  L2 Redis   → 30 分钟 TTL，5-10ms
  L3 PG 持久  → 跨 PR 的文件 blob SHA 不变，直接复用

缓存效果:
  PR 改 4 新文件 + 8 已缓存文件
    → 只分析 4 个新文件 (~24s)
    → 总耗时约 25s (vs 无缓存 72s)
```

---

## 五、分析准确性保障

### 5.1 六层准确性架构

```
Layer 1: 规则引擎     → 正则 + AST 确定性匹配，100% 精度
Layer 2: Semgrep      → 结构模式匹配，95% 精度
Layer 3: LLM 分析     → deepseek-v4-pro 思考模式，~75% 原始精度
Layer 4: 交叉验证     → Flash 复核 Pro 的输出，过滤 20-30% 误报
Layer 5: 多维置信度   → 5 维度加权打分，用户知道哪些可信
Layer 6: 反馈闭环     → 用户标记 → 数据回流 → 持续优化
```

### 5.2 三层互补机制

```
规则引擎命中 + LLM 也命中  → confidence 提升 (双重确认)
规则引擎命中 + LLM 未命中  → confidence=1.0 (确定性规则直出)
LLM 命中 + 规则未命中      → 进入交叉验证 (Flash 复核)
Semgrep 命中               → 与 LLM 结果互相印证
```

### 5.3 多维置信度计算

```typescript
interface ConfidenceScore {
  final: number;
  dimensions: {
    evidenceQuality:    number; // 代码证据明确程度
    patternMatch:       number; // 与已知问题模式匹配度
    contextSufficiency: number; // 上下文充分程度
    crossValidation:    number; // 交叉验证结果
    ruleCorroboration:  number; // 规则/Semgrep 确认度
  };
}
```

### 5.4 置信度前端展示策略

```
final >= 0.90  → 问题      → 默认展开
0.75 - 0.89   → 疑似问题   → 默认展开，标注"需人工确认"
0.50 - 0.74   → 建议审视   → 默认折叠，低置信度标记
< 0.50        → 不展示
```

### 5.5 反馈闭环

```
用户标记 [有用] / [误报]
  → 问题 + 反馈 + prompt + 上下文完整存库
  → 定期分析高误报模式:
    - 同一 ruleId precision < 0.6 → 停用该规则
    - 同一文件类型 precision 下降 → 调整 prompt
  → 验证通过的 issue → 作为 few-shot 正例加入 prompt
  → 标记误报的 issue → 作为反例，告诉模型"不要报告此类模式"
```

### 5.6 Prompt A/B 测试

```typescript
interface PromptVariant {
  id: string;
  content: string;
  weight: number;         // 流量分配
  metrics: {
    impressions: number;
    avgConfidence: number;
    precision: number;    // 用户确认率 ← 核心指标
    avgLatency: number;
  };
}

// precision 高的提权，低的自动降权，最终全量切换
```

---

## 六、响应速度与用户体验

### 6.1 时延目标

| 阶段 | 目标时延 | 用户看到什么 |
|------|---------|------------|
| 首次渲染 | ≤ 2s | 文件清单骨架、进度条 |
| Stage 1 总结 | ≤ 5s | 变更摘要 + 影响范围 |
| 第一批文件分析 | ≤ 8s | 前 5 个文件问题浮现 |
| 全量风险分析 | ≤ 25s | 全部文件分析完成 |
| 建议生成完毕 | ≤ 30s | 所有高危修复方案就绪 |
| 缓存命中 | ≤ 1s | 瞬间展示历史结果 |

### 6.2 流式架构 (SSE)

后端逐文件分析，结果通过 Server-Sent Events 实时推送：

```
时间线:
0s   → 输入 PR URL → fetch meta
2s   → Stage 1 完成 → 推送 summary
3s   → 并行启动批次分析
5s   → file-1 done → 推送 → UI 浮现结果
7s   → file-2 done → 推送 → 结果追加
10s  → 第一批完成 → 启动 Stage 3 建议生成
12s  → 建议逐个推送
15s  → 全部完成 → 推送 complete 事件
```

### 6.3 用户体验原则

1. **骨架加载**：无空白页，输入 PR URL 后立即出现文件清单骨架和进度条
2. **结果先到先展示**：文件列表实时更新状态（✅ 无问题 / 🔴 有问题 / ⏳ 分析中）
3. **可提前交互**：Stage 1 完成即可查看摘要和已出结果的文件
4. **进度可视化**：明确进度条 + 预计剩余时间
5. **智能折叠**：CRITICAL/HIGH 默认展开，MEDIUM/LOW 默认折叠

---

## 七、数据库模型

### 7.1 核心模型

```prisma
model User {
  id        String   @id @default(uuid())
  githubId  String   @unique
  name      String
  email     String?
  avatar    String?
  reviews   Review[]
}

model Review {
  id          String        @id @default(uuid())
  prUrl       String
  prTitle     String
  repoName    String
  branchFrom  String
  branchTo    String
  status      Status        @default(PENDING)
  summary     String?              // PR 变更总结 (markdown)
  metadata    Json?                // files_changed, additions, deletions
  overallScore Float?              // 综合评分 0-100
  decision    Decision?            // APPROVE / COMMENT / REQUEST_CHANGES
  policyId    String?
  policy      ReviewPolicy? @relation(...)
  createdAt   DateTime      @default(now())
  userId      String
  user        User          @relation(...)
  stageResults StageResult[]
  issues      ReviewIssue[]
}

model StageResult {
  id        String      @id @default(uuid())
  reviewId  String
  stage     ReviewStage       // SUMMARY / SECURITY / PERFORMANCE / ...
  status    StageStatus       // PASSED / WARNING / FAILED
  summary   String
  score     Float             // 该阶段评分 0-100
  issues    ReviewIssue[]
}

model ReviewIssue {
  id          String    @id @default(uuid())
  reviewId    String
  filePath    String
  lineStart   Int
  lineEnd     Int
  layer       Layer             // FRONTEND / BACKEND / DATABASE / CONFIG
  severity    Severity          // CRITICAL / HIGH / MEDIUM / LOW
  category    String            // INJECTION / AUTH / XSS / N_PLUS_ONE / ...
  title       String
  description String            // markdown
  codeSnippet String
  suggestion  Json?             // 修复建议 (codeBefore, codeAfter, alternatives)
  confidence  Float             // 0.0 - 1.0
  source      String            // rule-engine / semgrep / llm
  ruleId      String?           // 触发的规则 ID（可溯源）
  feedbacks   Feedback[]
}

model Feedback {
  id         String @id @default(uuid())
  issueId    String
  isAccurate Boolean
  comment    String?
  createdAt  DateTime @default(now())
}

model ReviewPolicy {
  id          String   @id @default(uuid())
  name        String
  description String?
  config      Json           // 审查策略 JSON 配置
  userId      String
  isDefault   Boolean @default(false)
}

model ContextFile {
  id          String   @id @default(uuid())
  reviewId    String
  filePath    String
  fileType    String          // changed / related
  contentHash String
  storageKey  String          // 对象存储路径
  size        Int
  createdAt   DateTime @default(now())
}
```

---

## 八、API 路由

| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/api/review` | 创建分析任务 |
| GET | `/api/review/[id]` | 获取分析结果 |
| GET | `/api/review/[id]/stream` | SSE 流式获取实时进度 |
| GET | `/api/reviews` | 历史记录列表 |
| POST | `/api/review/[id]/feedback` | 提交问题反馈 |
| GET | `/api/policies` | 获取审查策略列表 |
| POST | `/api/policies` | 创建自定义审查策略 |

---

## 九、前端路由

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 首页 | PR URL 输入 + 快速开始 |
| `/review/[id]` | 分析报告 | 看板 + 分栏 Diff 视图 |
| `/history` | 历史记录 | 列表，支持搜索过滤 |
| `/policies` | 策略管理 | 自定义审查规则配置 |
| `/settings` | 设置 | 账号关联、通知偏好 |

---

## 十、未来扩展方向

1. **GitHub App 集成**：直接在 PR 页面以 Comment 形式输出分析结果
2. **Webhook 自动触发**：新 PR 创建时自动启动分析
3. **团队知识库**：沉淀同一 repo 的历史 review 模式，学习项目特定规则
4. **多平台支持**：GitLab、Bitbucket
5. **自定义规则 DSL**：团队可编写自己的审查规则
6. **PR 质量趋势**：按时间维度统计团队代码质量变化
7. **IDE 插件**：VS Code / JetBrains 插件，本地实时分析
8. **CI/CD 集成**：作为 Pipeline 的一个 Check，不通过则阻断合并

---

## 十一、模型选择与上下文获取的设计思路

### 11.1 模型选择思路

- **分级而非单一模型**：不同任务对推理能力的需求不同。总结类任务 Flash 足够，核心风险分析用 Pro 思考模式，修复建议生成 Flash 即可
- **成本与质量平衡**：Pro 只打 Stage 2 这一仗，避免全链路使用高成本模型
- **思考模式的价值**：代码审查需要"理解语义→追溯调用链→判断真/假问题"，这是推理模型的强项

### 11.2 上下文获取思路

- **分层上下文**：diff → 变更文件全文 → 关联文件，按需加载，控制 token 消耗
- **AST 驱动的关联发现**：解析 import 语句自动获取类型定义，而非盲目加载整个项目
- **上下文存储 + 可复现**：完整保存每次分析的 prompt，便于调试和问题追溯
- **缓存基于 blob SHA**：文件未变则分析结果可复用，跨 PR 共享

### 11.3 未来发展思路

- **Fine-tune 行业模型**：基于用户反馈数据微调，提升特定领域（金融、医疗）的审查精度
- **Agent 化**：Review 结果可驱动自动修复 PR 提交
- **多 Agent 协作**：安全 Agent、性能 Agent、架构 Agent 并行工作，各司其职

# AI PR Review 助手 — 任务拆分文档

## 版本

| 版本 | 日期 | 作者 | 变更 |
|------|------|------|------|
| v1.0 | 2026-05-29 | - | 初始版本 |

---

## 总览

本文件将项目拆分为 5 个 Phase，总计 30+ 个可执行任务。拆分原则：

- **依赖最小化**：每个 Phase 内的任务尽最大可能并行
- **可独立验证**：每个任务有明确的完成标准 (DoD)
- **渐进交付**：Phase 1+2 即可跑通核心流程，后续 Phase 叠加增强

```
Phase 0: 项目基础设施          (预计 2-3h)
Phase 1: 核心数据流             (预计 4-6h) ← MVP 可交付
Phase 2: AI 分析流水线           (预计 6-8h)
Phase 3: Web 前端               (预计 8-12h)
Phase 4: 质量 & 体验增强         (预计 6-8h)
Phase 5: 部署 & 文档             (预计 2-3h)
```

---

## Phase 0: 项目基础设施

> 目标：搭建项目骨架，配置所有基础设施，确保能跑起来

### Task 0.1: 项目初始化 & 依赖安装

**描述**：初始化 Next.js 14 + TypeScript 项目，安装核心依赖

**具体工作**：
- `npx create-next-app@latest ai-pr-review-tool --typescript --tailwind --eslint --app --src-dir`
- 安装 shadcn/ui 并初始化
- 安装 Prisma、NextAuth.js、octokit、openai、redis 客户端
- 配置 `tsconfig.json` 路径别名 (`@/`)

**产出**：可 `npm run dev` 启动的项目骨架

**依赖**：无

**DoD**：`npm run dev` 启动成功，访问 `localhost:3000` 看到 Next.js 默认页面

---

### Task 0.2: PostgreSQL + Prisma Schema 初始化

**描述**：搭建数据库，创建 Prisma Schema 并执行初始迁移

**具体工作**：
- 本地启动 PostgreSQL (或 Docker Compose)
- 编写完整 Prisma Schema（User, Review, ReviewIssue, StageResult, Feedback, ReviewPolicy, ContextFile）
- `npx prisma migrate dev --name init`
- 生成 Prisma Client 单例工具函数

**产出**：数据库就绪，Prisma Client 可调用

**依赖**：0.1

**DoD**：执行 `npx prisma db push` 无报错，数据库表创建成功

---

### Task 0.3: GitHub OAuth 认证

**描述**：集成 NextAuth.js，支持 GitHub OAuth 登录

**具体工作**：
- 创建 GitHub OAuth App
- 配置 NextAuth.js + GitHub Provider
- 实现登录/登出页面
- Session 持久化 (数据库存储)
- Auth middleware 保护 API 路由

**产出**：用户可以 GitHub 登录，API 读取用户身份

**依赖**：0.2

**DoD**：登录流程走通，`/api/auth/session` 返回用户信息

---

### Task 0.4: 环境变量 & 配置管理

**描述**：统一管理所有环境变量和配置

**具体工作**：
- 创建 `.env.example` 模板
- 环境变量校验 (zod)
- 配置文件：`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `DEEPSEEK_API_KEY`, `DATABASE_URL`, `REDIS_URL`
- `.gitignore` 补充

**产出**：环境变量文档化，校验机制就绪

**依赖**：0.1

**DoD**：`.env.example` 包含所有必要变量，启动时自动校验

---

### Task 0.5: Docker Compose 开发环境

**描述**：用 Docker Compose 管理本地开发依赖 (PostgreSQL, Redis)

**具体工作**：
- 编写 `docker-compose.yml` (postgres + redis)
- 编写 `docker-compose.prod.yml` (生产环境模板)

**产出**：`docker compose up -d` 启动全部开发依赖

**依赖**：0.1

**DoD**：docker compose 启动后，PostgreSQL + Redis 可正常连接

---

## Phase 1: 核心数据流

> 目标：从 GitHub 拉取 PR 数据 → 组装上下文 → 存储，跑通无 AI 的数据链路

### Task 1.1: GitHub PR 数据获取服务

**描述**：封装 octokit，从 PR URL 提取完整数据

**具体工作**：
- URL 解析器：`https://github.com/{owner}/{repo}/pull/{number}` → 结构化参数
- `GitHubService` 类：
  - `getPRMeta(owner, repo, number)` → PR 元信息
  - `getPRFiles(owner, repo, number)` → 变更文件列表 + patch
  - `getFileContent(owner, repo, path, ref)` → 文件全文
  - `getPRCommits(owner, repo, number)` → commit 历史
- 错误处理：404 (PR 不存在)、403 (限流)、401 (未授权)
- 速率限制检测与处理

**产出**：`GitHubService` 可用，单元测试覆盖

**依赖**：0.4

**DoD**：输入真实 PR URL，控制台打印出完整的 PR meta + files + diff

---

### Task 1.2: 上下文构建器

**描述**：将 GitHub 原始数据组装为分析就绪的上下文结构

**具体工作**：
- `ContextBuilder` 类：
  - 构建文件分类 (前端/后端/数据库/配置)
  - AST 解析 import 语句 (使用 ts-morph / babel)
  - 按需获取关联文件 (项目内部 import 的类型定义)
  - 去重 + 限制上下文总大小
- `ContextStore` 类：快照存储到文件系统

**产出**：给定 PR URL，输出完整的 `ReviewContext` 结构

**依赖**：1.1

**DoD**：输出包含 diff + 变更文件全文 + 关联文件列表的上下文对象

---

### Task 1.3: Review 任务管理

**描述**：Review 的创建、状态流转、结果存取

**具体工作**：
- `POST /api/review` — 接收 PR URL，创建 Review 记录 (status: PENDING)，异步启动分析
- `GET /api/review/[id]` — 获取 Review 状态和结果
- Review 状态机：`PENDING → FETCHING → ANALYZING → SUGGESTING → COMPLETED / FAILED`
- 数据库读写层

**产出**：Review API 可创建、可查询

**依赖**：0.2, 1.1

**DoD**：POST 创建返回 reviewId，GET 轮询获取状态变化，数据库中有完整记录

---

### Task 1.4: 缓存机制

**描述**：实现 L1/L2/L3 三级缓存，降低重复请求

**具体工作**：
- 基于 contentHash (blob SHA) 的文件缓存
- L1 内存缓存 (Map)
- L2 Redis 缓存 (30min TTL)
- L3 PostgreSQL 持久缓存 (跨 PR 复用)
- 缓存失效策略

**产出**：同一个文件跨 PR 不重复拉取和分析

**依赖**：0.2, 0.5

**DoD**：相同文件 hash 命中缓存时，跳过 GitHub API 调用

---

## Phase 2: AI 分析流水线

> 目标：实现 Stage 1-3 的 AI 分析，跑通端到端的 Review 流程

### Task 2.1: DeepSeek API 客户端封装

**描述**：封装 DeepSeek API 调用，统一错误处理和重试

**具体工作**：
- `DeepSeekClient` 类，基于 openai SDK
- 支持 `deepseek-v4-flash` 和 `deepseek-v4-pro`
- 思考模式开关 (extra_body.thinking)
- 自动重试 (3 次，指数退避)
- token 用量统计
- 响应 JSON 解析 + 校验 (zod schema)

**产出**：Unified LLM 调用层

**依赖**：0.4

**DoD**：调用 DeepSeek API 返回正确响应，错误自动重试

---

### Task 2.2: Stage 1 — PR 变更总结

**描述**：基于 PR 元信息生成变更摘要

**具体工作**：
- Stage 1 Prompt 模板
- `SummaryAnalyzer` 服务
- 输入：PR meta + commit 历史 + 文件清单
- 输出：结构化摘要 JSON (summary, impact, focusAreas)
- 存储到 Review.summary 字段

**产出**：2-4 秒内生成 PR 变更摘要

**依赖**：1.2, 2.1

**DoD**：输入 PR URL → 输出中文摘要，包含变更目标、影响面和 Review 重点

---

### Task 2.3: 规则引擎

**描述**：实现确定性规则匹配，100% 精度的问题检测

**具体工作**：
- 规则定义 DSL (Rule interface)
- 内置规则集 (硬编码密钥、console.log、dangerouslySetInnerHTML、SQL 拼接等)
- 规则扫描器 (逐文件正则 + AST 匹配)
- 规则命中结果直接入库 (confidence=1.0, source="rule-engine")
- 规则命中标注到上下文，避免 LLM 重复报告

**产出**：确定性检测的零误报规则引擎

**依赖**：1.2

**DoD**：测试代码文件包含硬编码密钥 → 规则引擎捕获，confidence=1.0

---

### Task 2.4: Stage 2 — 风险代码识别

**描述**：基于 LLM 的分层风险分析 (整条流水线的核心)

**具体工作**：
- 后端审查 Prompt (注入/认证/敏感数据/业务逻辑/输入校验/资源/错误处理/性能/并发)
- 数据库审查 Prompt (Schema/SQL 注入/查询质量/事务/连接)
- 前端审查 Prompt (XSS/信息泄露/状态/边界/渲染性能)
- 配置文件审查 Prompt (端口/权限/镜像)
- 文件路由策略 (按扩展名自动选择审查 Prompt)
- 批次并行分析 (5 个/批)
- 输出解析 + Zod 校验

**产出**：按文件分类的并行风险分析

**依赖**：1.2, 2.1, 2.3

**DoD**：提交包含 SQL 注入 + XSS 漏洞的 PR → Stage 2 识别并给出结构化问题清单

---

### Task 2.5: 交叉验证

**描述**：用 Flash 模型复核 Pro 模型输出，降低误报

**具体工作**：
- `CrossValidator` 服务
- 将 Pro 模型发现的问题列表 + 原始代码发送给 Flash
- Flash 逐条判断：CONFIRMED / UNCERTAIN / FALSE_POSITIVE
- FALSE_POSITIVE → 移除
- UNCERTAIN → 降低置信度
- CONFIRMED → 保留并可能提升置信度

**产出**：误报率降低 20-30%

**依赖**：2.1, 2.4

**DoD**：向 Pro 输出注入 3 条已知误报 → Flash 复核后至少过滤 2 条

---

### Task 2.6: Stage 3 — Review 建议生成

**描述**：对 CRITICAL 和 HIGH 问题生成可执行修复方案

**具体工作**：
- Stage 3 Prompt 模板 (分层: 后端 / 数据库 / 前端)
- `SuggestionGenerator` 服务
- 输入：问题上下文 (前后 20 行) + 关联定义
- 输出：codeBefore / codeAfter / alternatives / rationale
- 修复方案类型标记：CODE_CHANGE / ARCHITECTURE_CHANGE / ADD_VALIDATION / ADD_MIDDLEWARE

**产出**：高危问题附带可执行修复代码和替代方案

**依赖**：2.1, 2.4

**DoD**：SQL 注入问题附带参数化查询的修复代码 + ORM 替代方案

---

### Task 2.7: 结果聚合 & Review Decision

**描述**：汇总所有阶段结果，计算综合评分，生成 Review 结论

**具体工作**：
- 多维度置信度计算 (5 维加权)
- 分阶段评分汇总
- 去重 (规则引擎 + Semgrep + LLM 重复报告)
- Review Decision 决策：APPROVE / COMMENT / REQUEST_CHANGES
- 结构化报告 JSON 生成

**产出**：完整的 Review 报告数据结构

**依赖**：2.2, 2.3, 2.4, 2.6

**DoD**：端到端：输入 PR URL → 输出完整 Review 报告 JSON

---

## Phase 3: Web 前端

> 目标：构建 Dashboard 看板 + Diff 分栏视图

### Task 3.1: 首页 — PR URL 输入

**描述**：首页输入框 + 提交入口

**具体工作**：
- URL 输入框 + 校验 (GitHub PR URL 格式)
- 近期 Review 记录快速入口
- "分析" 按钮触发 API 调用 → 跳转到结果页
- 骨架加载状态

**产出**：可交互的首页

**依赖**：1.3

**DoD**：输入 PR URL → 点击分析 → 跳转到 `/review/[id]`

---

### Task 3.2: Review 看板页面

**描述**：Dashboard 布局展示 Review 结果

**具体工作**：
- 综合评分卡片 (圆环进度)
- 各阶段评分横向对比 (backend/frontend/database)
- 问题列表 (按严重程度分组)
- CRITICAL/HIGH 默认展开，MEDIUM/LOW 默认折叠
- 阶段 tab 切换 (全部/后端/前端/数据库)
- Review Decision 横幅
- 导出 Markdown / JSON 按钮

**产出**：完整的 Review 看板

**依赖**：1.3, 2.7

**DoD**：Review 报告在看板中完整展示，支持 tab 切换和折叠

---

### Task 3.3: SSE 流式渲染

**描述**：实时展示分析进度，结果逐文件浮现

**具体工作**：
- SSE 客户端 hook (`useReviewStream`)
- 进度条 + 预计剩余时间
- 文件列表状态更新动画 (⏳ → ✅/🔴)
- 问题逐项浮现动画
- 可提前交互 (Stage 1 完成后即可查看)

**产出**：流式体验，首屏可见 ≤ 2s

**依赖**：1.3

**DoD**：输入 PR URL 后，文件逐个出现分析结果，进度条实时更新

---

### Task 3.4: Diff 分栏视图

**描述**：点击问题后展示左侧代码 diff + 右侧分析意见

**具体工作**：
- 代码 diff 渲染 (语法高亮，行号，变更标记)
- 问题行高亮 (黄色/红色背景)
- 右侧面板：问题详情 + 修复建议 + 替代方案
- "标记有用 / 标记误报" 按钮
- 返回到看板的导航

**产出**：可交互的 Diff 审查视图

**依赖**：3.2

**DoD**：点击问题 → 跳转到对应文件的对应行，展示 diff + 建议

---

### Task 3.5: 历史记录页面

**描述**：历史 Review 列表，支持搜索和过滤

**具体工作**：
- 列表展示 (PR 标题、repo、时间、评分、Decision)
- 搜索：PR URL / 标题 / repo 名称
- 过滤：Decision (APPROVE/COMMENT/REQUEST_CHANGES)、时间范围
- 分页
- 点击跳转到 Review 详情

**产出**：历史记录浏览

**依赖**：1.3

**DoD**：查看历史 Review 列表，搜索和过滤正常

---

### Task 3.6: 审查策略配置页面

**描述**：创建和管理自定义审查策略

**具体工作**：
- 策略列表
- 新建/编辑策略表单
- 阶段开关 + 权重调节
- 自定义规则编辑器 (JSON)
- 设为默认策略

**产出**：审查策略管理

**依赖**：0.2

**DoD**：创建自定义策略，下次 Review 可选该策略

---

## Phase 4: 质量 & 体验增强

> 目标：提升准确性、稳定性、用户体验

### Task 4.1: Semgrep 集成

**描述**：集成 Semgrep 结构模式匹配，与 LLM 互补

**具体工作**：
- Semgrep CLI 集成或使用 semgrep JS SDK
- 内置 Semgrep 规则集 (React、SQL、通用安全)
- 结果与 LLM 输出合并 (去重 + 加权)

**产出**：三层检测体系 (规则引擎 + Semgrep + LLM)

**依赖**：2.4

**DoD**：Semgrep 规则命中的问题出现在 Report 中

---

### Task 4.2: 反馈闭环

**描述**：用户反馈收集 → 数据沉淀 → 规则优化

**具体工作**：
- `POST /api/review/[id]/feedback` API
- 前端 "有用" / "误报" 交互
- 反馈数据存储
- 准确性统计面板 (内部运营)
- 高误报规则自动标记

**产出**：反馈数据收集链路跑通

**依赖**：3.2, 3.4

**DoD**：标记误报 → 数据库写入反馈记录 → 统计面板更新

---

### Task 4.3: Prompt A/B 测试框架

**描述**：多版本 Prompt 流量分配 + 效果量化对比

**具体工作**：
- `PromptVariant` 数据模型
- 流量分配器 (按权重随机选 variant)
- 指标收集 (avgConfidence, precision, avgLatency, avgTokens)
- 自动调权 (precision 低的降权)

**产出**：Prompt 版本迭代有数据支撑

**依赖**：4.2

**DoD**：创建两个 Prompt variant → 各分配流量 → 查看各指标对比

---

### Task 4.4: 响应优化

**描述**：全链路性能优化

**具体工作**：
- 前端资源延迟加载 + 代码分割
- API 响应 gzip/br 压缩
- 数据库查询优化 (索引、N+1 排查)
- 批量 API 调用合并
- React Server Components 用于静态内容

**产出**：各阶段响应达到时延目标

**依赖**：3.3

**DoD**：Lighthouse Performance 评分 > 90，API P95 < 200ms

---

### Task 4.5: 错误处理 & 边界情况

**描述**：全面的错误处理和边界情况覆盖

**具体工作**：
- GitHub API 限流 (429) 处理 + 退避
- DeepSeek API 超时 (60s) + 降级
- PR 无文件变更 / 超大 PR (>100 文件) 截断策略
- 空 diff / 二进制文件跳过
- 前端 Error Boundary
- 全局 404 / 500 页面

**产出**：所有异常路径有处理

**依赖**：全 Phase

**DoD**：模拟各种异常场景 → 系统优雅降级，不崩溃

---

## Phase 5: 部署 & 文档

> 目标：可生产部署，文档完善

### Task 5.1: Docker 生产构建

**描述**：多阶段 Docker 构建 + docker-compose 生产部署

**具体工作**：
- `Dockerfile` (多阶段：deps → build → runner)
- `docker-compose.prod.yml` (app + postgres + redis)
- 健康检查
- 非 root 用户运行

**产出**：`docker compose up` 即可部署

**依赖**：0.5, 全 Phase

**DoD**：生产容器启动 → 访问正常

---

### Task 5.2: CI/CD 流水线

**描述**：GitHub Actions 自动构建、测试、部署

**具体工作**：
- Lint + Type Check
- 单元测试
- 构建 Docker 镜像
- (可选) 自动部署到 Vercel

**产出**：Push → 自动验证 + 部署

**依赖**：5.1

**DoD**：Push 到 main → CI 通过 → 自动部署

---

### Task 5.3: 使用文档

**描述**：README + API 文档 + 部署文档

**具体工作**：
- README (项目介绍、快速开始、功能列表)
- API 文档 (接口说明、请求/响应示例)
- 部署文档 (环境变量、Docker 部署步骤)
- 审查策略配置指南

**产出**：新开发者 5 分钟内可启动

**依赖**：全 Phase

**DoD**：按 README 步骤操作，可在本地跑通全流程

---

## 依赖关系图

```
Phase 0:
  0.1 (项目初始化)
   ├── 0.2 (Prisma)
   ├── 0.4 (环境变量)
   └── 0.5 (Docker Compose)
        └── 0.3 (Auth) ← 依赖 0.2

Phase 1:
  0.4 ─→ 1.1 (GitHub Service)
  1.1 ─→ 1.2 (Context Builder)
  0.2 ─┬→ 1.3 (Review API)
  1.1 ─┘
  0.2 + 0.5 ─→ 1.4 (缓存)

Phase 2:
  0.4 ─→ 2.1 (DeepSeek Client)
  1.2 + 2.1 ─→ 2.2 (Stage 1)
  1.2 ─→ 2.3 (规则引擎)
  1.2 + 2.1 + 2.3 ─→ 2.4 (Stage 2)
  2.1 + 2.4 ─→ 2.5 (交叉验证)
  2.1 + 2.4 ─→ 2.6 (Stage 3)
  2.2 + 2.3 + 2.4 + 2.6 ─→ 2.7 (聚合 & Decision)

Phase 3:
  1.3 ─→ 3.1 (首页)
  1.3 + 2.7 ─→ 3.2 (看板)
  1.3 ─→ 3.3 (SSE 流式)
  3.2 ─→ 3.4 (Diff 视图)
  1.3 ─→ 3.5 (历史记录)
  0.2 ─→ 3.6 (策略配置)

Phase 4:
  2.4 ─→ 4.1 (Semgrep)
  3.2 + 3.4 ─→ 4.2 (反馈闭环)
  4.2 ─→ 4.3 (A/B 测试)
  3.3 ─→ 4.4 (性能优化)
  全 Phase ─→ 4.5 (错误处理)

Phase 5:
  0.5 + 全 Phase ─→ 5.1 (Docker 生产)
  5.1 ─→ 5.2 (CI/CD)
  全 Phase ─→ 5.3 (文档)
```

---

## 开始策略

**第一周目标 (Phase 0 + 1)**：跑通数据流
- 0.1 → 0.2 → 0.4 → 0.5 并行 → 0.3
- 1.1 → 1.2 → 1.3 → 1.4
- 验证：输入 PR URL → 数据库中看到完整上下文数据

**第二周目标 (Phase 2)**：跑通 AI 分析
- 2.1 → 2.2 + 2.3 并行 → 2.4 → 2.5 + 2.6 并行 → 2.7
- 验证：输入 PR URL → 输出完整 Review 报告 JSON

**第三周目标 (Phase 3)**：前端可用
- 3.1 + 3.3 并行 → 3.2 → 3.4 → 3.5 → 3.6
- 验证：完整 UI 交互流程

**第四周目标 (Phase 4 + 5)**：质量 + 部署
- 4.1 ~ 4.5 并行推进
- 5.1 → 5.2 → 5.3
- 验证：生产环境可部署，文档完善

# AI PR Review 助手

基于大语言模型的智能代码评审工具，帮助开发团队提升 Pull Request 的 Review 效率与质量。

## 功能特性

- **PR 变更总结**：自动生成变更摘要、影响范围分析和 Review 重点建议
- **全栈风险识别**：覆盖前端、后端、数据库、配置文件的多维度安全检查
- **智能修复建议**：对高危问题生成可执行的代码修复方案和替代方案
- **Review Decision**：基于量化评分输出明确的 APPROVE / COMMENT / REQUEST_CHANGES 结论
- **流式分析体验**：SSE 实时推送分析进度，结果逐文件浮现，首屏可见 ≤ 2s
- **反馈闭环**：用户标记误报/有用，数据回流持续优化分析准确性

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 14 (App Router) + TypeScript |
| UI | React + Tailwind CSS + shadcn/ui |
| 数据库 | PostgreSQL + Prisma ORM |
| 缓存 | Redis |
| 认证 | NextAuth.js + GitHub OAuth |
| AI | DeepSeek API (`deepseek-v4-flash` + `deepseek-v4-pro`) |
| GitHub | Octokit SDK |
| 项目管理 | OpenSpec (Spec-Driven Development) |

## 快速开始

### 前置要求

- Node.js >= 20
- PostgreSQL >= 14
- Redis >= 6
- GitHub OAuth App
- DeepSeek API Key

### 本地开发

```bash
# 1. 克隆项目
git clone https://github.com/Jice19/AI-PR-Review-.git
cd AI-PR-Review-

# 2. 安装依赖
npm install

# 3. 启动开发依赖 (PostgreSQL + Redis)
docker compose up -d

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env 填入必要配置

# 5. 初始化数据库
npx prisma migrate dev

# 6. 启动开发服务器
npm run dev
```

访问 http://localhost:3000

### 环境变量

```bash
# 数据库
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai-pr-review"

# Redis
REDIS_URL="redis://localhost:6379"

# GitHub OAuth
GITHUB_CLIENT_ID="your_client_id"
GITHUB_CLIENT_SECRET="your_client_secret"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your_secret"

# DeepSeek API
DEEPSEEK_API_KEY="your_api_key"
```

## 项目结构

```
├── docs/                     # 项目文档
│   ├── PROJECT_DESIGN.md     # 完整设计方案
│   ├── TASK_BREAKDOWN.md     # 任务拆分
│   └── DESIGN_RATIONALE.md   # 设计思路说明
├── openspec/                 # OpenSpec 规范驱动开发
│   ├── specs/                # 系统规范
│   └── changes/              # 变更提案
├── scripts/
│   └── ci-review.ts          # GitHub Actions CI 入口
├── .github/workflows/
│   └── ai-pr-review.yml      # AI PR Review workflow
├── prisma/
│   └── schema.prisma         # 数据库模型
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── page.tsx          # 首页
│   │   ├── login/page.tsx    # 登录页
│   │   ├── review/[id]/      # 分析报告页
│   │   └── api/              # API Routes
│   │       ├── webhook/      # GitHub Webhook 接收
│   │       └── review/       # Review CRUD + 导出入口
│   ├── frontend/
│   │   ├── components/       # React 组件
│   │   └── hooks/            # 自定义 hooks
│   └── backend/
│       ├── lib/              # 工具函数
│       │   ├── github.ts     # GitHub API 封装
│       │   ├── llm.ts        # DeepSeek 客户端 (Flash/Pro/Stream)
│       │   ├── embedding.ts  # 百炼 Embedding 服务
│       │   ├── prisma.ts     # Prisma Client 单例
│       │   ├── env.ts        # 环境变量校验 (zod)
│       │   └── utils.ts      # 通用工具 (cn)
│       ├── services/         # 业务逻辑
│       │   ├── review.ts     # Review 编排 + SSE 推送
│       │   ├── analyzer.ts   # AI 分析流水线 (Summary → Risk → Suggest)
│       │   ├── context.ts    # 上下文构建器 (import 解析 + 关联文件)
│       │   └── feedback-learner.ts  # RAG 反馈学习 (pgvector)
│       └── types/            # TypeScript 类型定义
├── docker-compose.yml        # 开发环境
├── Dockerfile                # 生产构建
└── .env.example              # 环境变量模板
```

## 文档

- [项目设计方案](./docs/PROJECT_DESIGN.md)
- [任务拆分](./docs/TASK_BREAKDOWN.md)

## License

MIT

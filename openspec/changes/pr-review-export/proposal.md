## Why

AI PR Review 完成分析后，用户需要将分析结果导出为结构化文档，交给其他 AI Agent（如 Claude Code、Cursor、Copilot 等）继续完善该 PR。当前系统的 review 报告仅能在 Web UI 中查看，无法方便地分享或传递给其他工具。

## What Changes

- 新增 API 端点 `GET /api/review/[id]/export`，生成结构化 Markdown 文档并返回为可下载文件
- 前端 Review 完成页面新增「导出文档」按钮，一键下载 `.md` 文件
- 文档结构面向 AI Agent 可解析设计：包含清晰的章节标题、结构化元数据、分级问题列表和修复建议

## Capabilities

### New Capabilities
- `pr-review-export`: 将已完成的 PR Review 分析结果导出为 Agent-friendly Markdown 文档

## Impact

- 后端：新增 1 个 API Route 文件，复用现有 `getReview()` + `requireAuth()`
- 前端：`ReviewReport.tsx` 添加 1 个导出按钮 + 下载逻辑
- 数据库：无变动
- 环境变量：无新增

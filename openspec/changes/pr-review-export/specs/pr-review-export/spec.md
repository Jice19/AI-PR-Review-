## ADDED Requirements

### Requirement: 导出已完成的 PR Review 为 Markdown 文档
系统 SHALL 提供 API 将已完成的 review 分析结果导出为结构化 Markdown 文档，支持浏览器下载。

#### Scenario: 导出已完成的 review
- **WHEN** 用户请求 `GET /api/review/{id}/export` 且 review.status === "COMPLETED"
- **THEN** 返回 `text/markdown` 响应，`Content-Disposition` 头为 `attachment; filename="pr-review-{id}.md"`，内容包含 PR 元信息表格、变更总结、综合评分与决策、按严重程度分组的所有问题及修复建议

#### Scenario: 导出未完成的 review
- **WHEN** 用户请求导出 status !== "COMPLETED" 的 review
- **THEN** 返回 400 错误 `{ "error": "Review 尚未完成，无法导出" }`

#### Scenario: 未登录用户导出
- **WHEN** 未登录用户请求导出
- **THEN** 返回 401 错误 `{ "error": "请先登录" }`

#### Scenario: 导出不存在的 review
- **WHEN** 请求的 review id 不存在
- **THEN** 返回 404 错误 `{ "error": "Review 不存在" }`

### Requirement: 导出文档结构面向 AI Agent 可解析
导出的 Markdown 文档 SHALL 使用清晰的层级结构、一致的键值对格式和标准 Markdown 语法，确保 AI Agent 可准确解析各字段。

#### Scenario: 文档包含完整元数据
- **WHEN** 导出 review 文档
- **THEN** 文档头部包含 Markdown 表格：PR URL、Repository、Branch、Review Date、Overall Score、Decision、Decision Reason

#### Scenario: 文档按严重程度分组问题
- **WHEN** review 包含不同严重程度的 issue
- **THEN** 文档按 CRITICAL → HIGH → MEDIUM → LOW 顺序分组，每组标注数量

#### Scenario: 文档包含修复建议的 before/after 代码
- **WHEN** issue 包含 suggestion（codeBefore + codeAfter）
- **THEN** 文档以独立代码块展示修复前和修复后代码，标注语言类型

#### Scenario: review 无问题
- **WHEN** review 未发现任何 issue
- **THEN** 文档问题列表章节显示「未发现问题，代码质量良好」

### Requirement: 前端提供一键导出按钮
已完成 review 的报告页面 SHALL 提供「导出文档」按钮，点击后自动下载 Markdown 文件。

#### Scenario: 点击导出按钮
- **WHEN** 用户在已完成的 review 页面点击「导出文档」按钮
- **THEN** 浏览器自动下载 `pr-review-{id}.md` 文件

#### Scenario: 未完成 review 不显示导出按钮
- **WHEN** review 状态为 PENDING / FETCHING / ANALYZING / SUGGESTING / FAILED
- **THEN** 页面不显示「导出文档」按钮

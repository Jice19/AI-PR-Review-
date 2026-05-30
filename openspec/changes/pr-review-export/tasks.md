## 1. 导出 API

- [ ] 1.1 创建 `src/app/api/review/[id]/export/route.ts`
  - GET 方法，复用 `requireAuth()` 鉴权
  - 调用 `getReview(id)` 获取完整 review 数据（含 issues + feedbacks）
  - 按 D2 文档结构拼接 Markdown 字符串
  - 返回 `text/markdown` 响应，带 `Content-Disposition: attachment` 头

## 2. 前端导出按钮

- [ ] 2.1 修改 `src/frontend/components/ReviewReport.tsx`
  - 在 COMPLETED 状态的 Header 区域添加「导出文档」按钮
  - 实现 `handleExport()` 函数：fetch API → Blob → 触发下载
  - 按钮样式与现有 UI 风格一致

## 3. 验证

- [ ] 3.1 启动 dev server，完成一次 review 分析
- [ ] 3.2 点击「导出文档」按钮，确认下载 `.md` 文件
- [ ] 3.3 检查文件内容完整：PR 元信息、总结、评分、所有 issue + suggestion
- [ ] 3.4 将导出的 .md 文件交给其他 AI Agent 测试可解析性

## Context

当前 `GET /api/review/[id]` 已返回完整的 review 数据（含 summary、score、decision、issues + suggestions）。需新增一个导出端点，将同一份数据格式化为结构化 Markdown 文档并触发浏览器下载。导出逻辑纯服务端完成，不依赖额外服务。

## Goals / Non-Goals

**Goals:**
- 已完成（COMPLETED）的 review 可导出为 `.md` 文件
- 文档结构化，方便 AI Agent 解析（清晰的 Markdown 标题层级、代码块、键值对元数据）
- 导出内容包含：PR 元信息、变更总结、综合评分/决策、按严重程度分组的所有问题及修复建议
- 一键下载，无需额外步骤

**Non-Goals:**
- 不做 JSON/PDF 等其他格式导出（Markdown 是最通用的 Agent 可消费格式）
- 不做批量导出
- 不做分享链接/在线预览
- 不对 PENDING/FETCHING/ANALYZING 状态的 review 导出（仅 COMPLETED）

## Decisions

### D1: 文档格式选择

使用 **Markdown**（`.md`），原因：
- 纯文本，所有 AI Agent 原生支持解析
- 代码块语法高亮在任意 Agent 中均可渲染
- 不需要额外依赖（JSON 也需要重新格式化才能给人看）
- 用户也可以直接用编辑器打开阅读

### D2: 文档结构

```
# PR Review Report: {prTitle}

## Metadata
| 字段 | 值 |
|------|-----|
| PR URL | ... |
| Repository | ... |
| Branch | from → to |
| Review Date | ... |
| Overall Score | 85/100 |
| Decision | APPROVE / COMMENT / REQUEST_CHANGES |
| Decision Reason | ... |

## 变更总结
{summary markdown}

## 综合评分: {score}/100
**Decision**: {decision} — {decisionReason}

## 问题列表

### CRITICAL ({n} 个)
#### {n}. {title} — {filePath}:{lineStart}
- **分类**: {category}
- **置信度**: {confidence}
- **描述**: {description}

**问题代码**:
```language
{codeSnippet}
```

**修复建议**:
- **修复前**:
```language
{codeBefore}
```
- **修复后**:
```language
{codeAfter}
```
- **安全性说明**: {securityRationale}

### HIGH ({n} 个)
...

### MEDIUM ({n} 个)
...

### LOW ({n} 个)
...

## 修复优先级建议
1. [CRITICAL] ...
2. [HIGH] ...
...
```

### D3: API 响应方式

使用 `Content-Disposition: attachment` 触发浏览器下载：
```typescript
return new NextResponse(markdown, {
  headers: {
    "Content-Type": "text/markdown; charset=utf-8",
    "Content-Disposition": `attachment; filename="pr-review-${review.id.slice(0, 8)}.md"`,
  },
});
```

### D4: 前端下载方式

```typescript
const res = await fetch(`/api/review/${review.id}/export`);
const blob = await res.blob();
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = `pr-review-${review.id.slice(0, 8)}.md`;
a.click();
URL.revokeObjectURL(url);
```

## Risks / Trade-offs

- **无风险**：纯只读操作，不修改任何数据，不依赖外部服务
- 唯一考虑：review summary 可能很长（几万字），但一个 .md 文件几十 KB 完全在可接受范围内

## Migration Plan

无需迁移。新增功能，不影响现有任何流程。部署后即可使用。

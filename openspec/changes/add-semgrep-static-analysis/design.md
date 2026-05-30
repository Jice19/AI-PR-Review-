## Context

当前系统所有代码问题完全由 LLM 检测。LLM 对确定性安全问题（XSS 的 innerHTML 赋值、SQL 字符串拼接、硬编码密钥）存在误报且浪费 token。Semgrep 通过 AST 模式匹配能以 100% 准确率检出这类问题。

Semgrep 本身不需要运行时安装——通过 `npx` 或 CI 预装即可。分析时对每个文件执行规则匹配，返回 JSON 结果，解析后生成 issue。

## Goals / Non-Goals

**Goals:**
- 定义 4-6 条核心 Semgrep 规则覆盖最常见的确定性问题
- LLM 分析前跑 Semgrep，命中的问题直接以 source: "semgrep"、confidence: 1.0 入库
- LLM prompt 不再重复要求检测这些规则，专注需要推理的问题
- CI 模式同样生效（GitHub Actions 中 npx semgrep）

**Non-Goals:**
- 不引入 Semgrep 官方规则库全部规则（太过庞大）
- 不做增量 lint（每次全量扫描文件即可，Semgrep 够快）
- 不替换 LLM——Semgrep 是补充，不是替代

## Decisions

### D1: 规则定义策略

用 `.semgrep.yml` 文件定义规则，放在项目根目录。CI 和本地都能直接用。

规则覆盖：

| 规则 ID | 类别 | 模式 |
|---------|------|------|
| `xss-innerhtml` | XSS | `.innerHTML = ...` 赋值 |
| `xss-dangerously` | XSS | React `dangerouslySetInnerHTML` |
| `sql-injection-raw` | SQL_INJECTION | `$queryRawUnsafe(...)` 含模板字符串 |
| `hardcoded-secret` | INFO_LEAK | 变量名匹配 `apiKey\|token\|secret\|password` 且值为字符串字面量 |
| `unsafe-eval` | CODE_QUALITY | `eval(...)` 调用 |

### D2: 调用方式

CI 和本地统一用 `npx semgrep`：

```
npx semgrep --config .semgrep.yml --json src/
```

返回 JSON，解析后提取 finding 生成 issue 对象。

### D3: 分析流程

```
每个文件
  → Semgrep 扫一遍（毫秒级）
  → 命中 → 生成 issue（source: "semgrep", confidence: 1.0）
  → LLM 分析时，prompt 中已命中的类别标注"已由静态分析覆盖，跳过"
  → LLM 专注逻辑/架构/业务问题
```

### D4: Prompt 改动

每个层级的 prompt 增加一行：

```
### 已由静态分析自动检出（请跳过以下维度，专注其他问题）
{semgrep 已命中的类别列表，如 XSS, SQL_INJECTION}
```

## Risks / Trade-offs

- **Semgrep 未安装**：`npx semgrep` 首次运行需要下载。→ CI 中预装，本地开发可选。
- **误报**：Semgrep AST 匹配比正则准确得多，但仍有少量误报（如 innerHTML 确实安全的情况）。→ 置信度给 1.0 但用户仍可标记为 FALSE_POSITIVE。
- **规则维护**：规则需要随项目演进更新。→ 规则数量少且稳定，维护成本低。

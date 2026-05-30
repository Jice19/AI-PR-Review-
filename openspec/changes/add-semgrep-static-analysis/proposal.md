## Why

当前全量依赖 LLM 做代码审查，但 XSS、SQL 注入、硬编码密钥等确定性问题完全可以用 AST 模式匹配 100% 准确检出。LLM 对这类问题存在误报（看到 innerHTML 就报但不判断上游是否已清洗），且浪费 token。需要在 LLM 分析前加入 Semgrep 静态分析层，确定性规则命中直接标为 1.0 置信度 issue，LLM 专注需要推理的复杂问题。

## What Changes

- 新增 `semgrep-rules/` 规则目录，定义 XSS / SQL 注入 / 硬编码密钥等规则
- 新增 `src/backend/services/static-analyzer.ts`：调用 Semgrep CLI 扫描文件，解析结果
- 修改 `analyzer.ts` 的 `runFullAnalysis()`：LLM 分析前先跑 Semgrep，命中规则直接生成 issue（source: "semgrep", confidence: 1.0）
- 修改 `review.ts` 的 `analyzePRInBackground()`：同步加上 Semgrep 预处理
- 修改 LLM prompt：精简已由静态分析覆盖的规则描述，减少 prompt token

## Capabilities

### New Capabilities
- `semgrep-static-analysis`: Semgrep 静态分析集成，确定性规则预处理

### Modified Capabilities
- `file-risk-analysis`: 分析前加入 Semgrep 预处理，命中规则不再让 LLM 重复检查

## Impact

- 新增 semgrep-rules 规则目录，`.semgrep.yml` 配置文件
- 新增 `static-analyzer.ts` 服务模块
- 修改 `analyzer.ts` / `review.ts` 分析流水线
- 无需新增数据库迁移
- 无前端改动

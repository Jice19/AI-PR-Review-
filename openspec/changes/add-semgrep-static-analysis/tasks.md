## 1. Semgrep 规则定义

- [ ] 1.1 创建 `.semgrep.yml`，定义 xss-innerhtml / xss-dangerously / sql-injection-raw / hardcoded-secret / unsafe-eval 五条规则

## 2. 静态分析服务

- [ ] 2.1 创建 `src/backend/services/static-analyzer.ts`
- [ ] 2.2 实现 `runSemgrepScan(files)`: 对文件列表执行 Semgrep 扫描，返回 Issue 数组
- [ ] 2.3 实现 `parseSemgrepOutput(json)`: 将 Semgrep JSON 输出转为内部 Issue 类型

## 3. 集成到分析流水线

- [ ] 3.1 修改 `analyzer.ts` 的 `runFullAnalysis()`: LLM 分析前先跑 Semgrep
- [ ] 3.2 修改 `review.ts` 的 `analyzePRInBackground()`: 同样加入 Semgrep 预处理
- [ ] 3.3 Semgrep 命中的规则类别传递给 LLM prompt，跳过已覆盖维度

## 4. 验证

- [ ] 4.1 本地跑 `npx semgrep --config .semgrep.yml src/` 验证规则生效
- [ ] 4.2 对 test/buggy-export-module 跑完整分析，验证 Semgrep + LLM 混合输出

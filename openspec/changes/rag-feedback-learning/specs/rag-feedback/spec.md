## ADDED Requirements

### Requirement: 提交反馈时自动向量化
系统 SHALL 在用户提交 Issue 反馈后，异步将 codeSnippet 向量化并存入 FeedbackVector 表。

#### Scenario: 提交有用反馈
- **WHEN** 用户提交 feedback=USEFUL 的反馈
- **THEN** 系统异步调用 embedding API 将 issue 的 codeSnippet 转为 1024 维向量，写入 FeedbackVector，附带 layer、category、severity 等元数据

#### Scenario: 提交误报反馈
- **WHEN** 用户提交 feedback=FALSE_POSITIVE 的反馈
- **THEN** 同上，feedback 字段标记为 FALSE_POSITIVE

#### Scenario: embedding API 失败不阻塞
- **WHEN** embedding API 调用失败
- **THEN** 反馈提交仍然成功，向量写入跳过，console.error 记录错误

### Requirement: 分析时 RAG 检索相似反馈
系统 SHALL 在执行 `analyzeFileRisk()` 前，使用当前文件代码进行向量检索，获取历史反馈案例。

#### Scenario: 检索到相似案例
- **WHEN** 当前文件 layer=backend，向量库中有同 layer 的历史反馈
- **THEN** 返回 top-3 USEFUL 案例和 top-3 FALSE_POSITIVE 案例，按余弦距离排序

#### Scenario: 向量库为空
- **WHEN** FeedbackVector 表中无数据
- **THEN** 返回空结果，不注入 prompt，分析流程正常进行

#### Scenario: 相似度低于阈值
- **WHEN** 检索结果的最大相似度 < 0.7
- **THEN** 不注入 prompt（避免不相关案例干扰 LLM）

### Requirement: RAG 案例注入分析 Prompt
系统 SHALL 将 RAG 检索到的反馈案例格式化后注入 `analyzeFileRisk()` 的 prompt。

#### Scenario: 有正例和负例
- **WHEN** 检索到 top-3 USEFUL 和 top-3 FALSE_POSITIVE
- **THEN** prompt 末尾追加 "历史反馈学习" 章节，正例标注 ✅ 请保持，负例标注 ❌ 请避免

#### Scenario: 仅有一种类型
- **WHEN** 仅检索到 USEFUL 或仅检索到 FALSE_POSITIVE
- **THEN** 仅展示有数据的那种类型

#### Scenario: 无检索结果
- **WHEN** 无检索结果（空库或低于阈值）
- **THEN** prompt 保持不变，不追加任何内容

### Requirement: Embedding 客户端配置
系统 SHALL 使用阿里云百炼兼容 OpenAI 的 embedding API，配置可切换模型。

#### Scenario: 调用 embedding API
- **WHEN** `embed(["code snippet 1", "code snippet 2"])` 被调用
- **THEN** 使用 BAILIAN_API_KEY 和 BAILIAN_EMBEDDING_MODEL 调用百炼 API，返回 1024 维向量数组

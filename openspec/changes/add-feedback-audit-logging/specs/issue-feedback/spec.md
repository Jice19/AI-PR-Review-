## ADDED Requirements

### Requirement: 开发者可提交三态反馈
系统 SHALL 允许开发者对任意 ReviewIssue 提交反馈，反馈类型为 USEFUL（有用）、FALSE_POSITIVE（误报）或 NEEDS_REVIEW（需进一步评审）。

#### Scenario: 提交正向反馈
- **WHEN** 开发者点击某个 Issue 的"有用"按钮
- **THEN** 系统创建一条反馈记录，feedback=USEFUL，并返回成功状态

#### Scenario: 提交误报反馈
- **WHEN** 开发者点击"误报"按钮
- **THEN** 系统创建一条反馈记录，feedback=FALSE_POSITIVE，并返回成功状态

#### Scenario: 提交待确认反馈
- **WHEN** 开发者点击"待确认"按钮
- **THEN** 系统创建一条反馈记录，feedback=NEEDS_REVIEW，并返回成功状态

#### Scenario: 重复反馈
- **WHEN** 开发者对已有反馈的 Issue 再次提交
- **THEN** 系统覆盖原有反馈（upsert），而非创建重复记录

### Requirement: 反馈需记录提交人
系统 SHALL 在每条 IssueFeedback 中记录提交人的 GitHub 用户名。

#### Scenario: 记录反馈人
- **WHEN** 已登录用户提交反馈
- **THEN** IssueFeedback.createdBy 字段写入当前用户的 GitHub 用户名

### Requirement: 查询反馈统计
系统 SHALL 提供按 Review 维度查询反馈统计的 API，返回各类型反馈数量。

#### Scenario: 查询某次 Review 的反馈统计
- **WHEN** 请求 GET /api/review/:id/feedback-stats
- **THEN** 返回 `{ total: N, useful: N, falsePositive: N, needsReview: N }`

### Requirement: 前端反馈按钮
系统 SHALL 在每个 Issue 卡片上展示三个反馈按钮，点击后即时提交并更新 UI 状态。

#### Scenario: 点击后立即更新
- **WHEN** 开发者点击某个反馈按钮
- **THEN** 按钮组变为禁用态，已选按钮高亮，其他按钮变灰

#### Scenario: 已反馈的 Issue 展示状态
- **WHEN** Issue 已有反馈记录
- **THEN** 加载时按钮组展示已有选择，禁止再次点击（除非刷新页面后重新选择即覆盖）

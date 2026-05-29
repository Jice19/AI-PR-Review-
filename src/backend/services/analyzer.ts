import { callFlash, callPro } from "@/backend/lib/llm";

// 文件风险分析使用 Flash（快），建议生成使用 Pro（深）
import type { ReviewContext, Issue, Suggestion } from "@/backend/types";

// ========== Stage 1: PR 变更总结 ==========

interface SummaryOutput {
  summary: string;
  impact: string;
  focusAreas: string[];
}

export async function analyzeSummary(context: ReviewContext): Promise<SummaryOutput> {
  const commits = context.commits
    .slice(0, 10)
    .map((c) => `- ${c.message.split("\n")[0]}`)
    .join("\n");

  const fileList = context.files
    .map((f) => `- ${f.path} (${f.layer}, +${f.additions}/-${f.deletions})`)
    .join("\n");

  const result = await callFlash<SummaryOutput>([
    {
      role: "user",
      content: `你是代码审查专家。根据以下信息生成简洁的PR变更总结。

## PR 信息
- 标题: ${context.prTitle}
- 描述: ${context.prDescription || "无"}
- 分支: ${context.branchFrom} → ${context.branchTo}
- 文件变更: ${context.files.length} 个文件

## Commit 历史
${commits || "无"}

## 变更文件
${fileList}

## 要求
1. 用 3-5 句话用中文概括变更目标和范围
2. 用 1-2 句说明潜在影响面
3. 用 1 句给出 review 关注重点建议
4. 不要评价代码质量，只做高层总结

## 输出 JSON 格式
{
  "summary": "变更总结（3-5句话）",
  "impact": "影响范围分析（1-2句话）",
  "focusAreas": ["关注重点1", "关注重点2", "关注重点3"]
}`,
    },
  ]);

  return result;
}

// ========== Stage 2: 风险代码识别 ==========

interface RiskOutput {
  issues: Issue[];
}

const BACKEND_PROMPT = `
你是后端安全与架构审查专家。请对以下代码变更进行审查。

## 审查维度（按严重程度排序）

### CRITICAL（必查）
1. SQL注入: 字符串拼接SQL、raw query未参数化
2. 认证授权: 缺失权限检查、越权风险、middleware顺序错误
3. 敏感数据暴露: 异常堆栈直接返回、日志打印密码/密钥、响应返回不该暴露的字段

### HIGH
4. 业务逻辑: 支付/库存/积分等关键操作的幂等性缺失、竞态条件
5. 输入校验: 缺少参数类型/范围校验、未做深度校验
6. 资源安全: 文件上传未校验类型和大小、SSRF风险

### MEDIUM
7. 错误处理: 未捕获Promise rejection、空catch块
8. 性能: 循环中调外部服务、不必要的深拷贝
9. 并发控制: 共享状态无锁保护

## 约束
- 只报告变更引入的新问题
- 每个问题给出文件路径、行号、严重程度、分类
- 不确定的问题标注 confidence 低于 0.7
- 如果文件无任何问题返回空数组`;

const DATABASE_PROMPT = `
你是数据库性能与安全审查专家。请对以下数据库相关代码变更进行审查。

## 审查维度

### CRITICAL
1. 破坏性迁移: DROP TABLE/COLUMN、修改列类型、删除外键、修改NOT NULL
2. SQL注入: 字符串拼接SQL、动态表名未做白名单、raw query未参数化

### HIGH
3. 查询质量: SELECT * 无LIMIT、N+1查询、大偏移量分页
4. 索引缺失: 新表/新列无索引、JSON列做频繁查询条件
5. 危险操作: 无WHERE的DELETE/UPDATE

### MEDIUM
6. 事务安全: 事务中调用外部服务、缺少rollback
7. 连接管理: 可能泄漏的连接

## 约束
- 只报告变更引入的新问题
- 涉及表名时在描述中明确提及
- 无问题返回空数组`;

const FRONTEND_PROMPT = `
你是前端安全与质量审查专家。请对以下前端代码变更进行审查。

## 审查维度

### CRITICAL
1. XSS: dangerouslySetInnerHTML/v-html、innerHTML直接使用、用户输入直接渲染
2. 信息泄露: 前端硬编码密钥/token、localStorage存敏感数据、console.log输出敏感信息

### HIGH
3. 状态管理: useEffect依赖缺失、组件卸载后setState
4. 边界条件: 未处理loading/error/empty状态

### MEDIUM
5. 渲染性能: 未memo的计算密集组件、列表key用index
6. 资源清理: useEffect中定时器/事件监听未清理

## 约束
- 只报告变更引入的新问题
- 无问题返回空数组`;

const LAYER_PROMPTS: Record<string, string> = {
  backend: BACKEND_PROMPT,
  database: DATABASE_PROMPT,
  frontend: FRONTEND_PROMPT,
  config: BACKEND_PROMPT, // 配置文件用后端 prompt 兜底
};

/**
 * 分析单个文件的风险
 */
export async function analyzeFileRisk(
  file: ReviewContext["files"][0],
  relatedContext: string
): Promise<Issue[]> {
  const prompt = LAYER_PROMPTS[file.layer] || BACKEND_PROMPT;

  // 截断过长内容
  const maxContentLen = 8000;
  const fullContent = file.fullContent.slice(0, maxContentLen);
  const diff = file.diff.slice(0, maxContentLen);

  const result = await callFlash<RiskOutput>([
    {
      role: "user",
      content: `${prompt}

## 文件信息
- 路径: ${file.path}
- 层级: ${file.layer}

## Diff
\`\`\`diff
${diff || "(空 diff)"}
\`\`\`

## 完整文件内容（变更后的完整代码，用于理解上下文）
\`\`\`
${fullContent || "(无法获取完整内容)"}
\`\`\`

## 关联类型/接口/函数定义
${relatedContext || "(无关联上下文)"}

## 输出 JSON 格式（严格遵守）
{
  "issues": [
    {
      "filePath": "${file.path}",
      "lineStart": 数字,
      "lineEnd": 数字,
      "layer": "${file.layer}",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "category": "SQL_INJECTION|AUTH|DATA_EXPOSURE|XSS|N_PLUS_ONE|...",
      "title": "简短标题",
      "description": "详细问题描述",
      "codeSnippet": "出错代码片段",
      "confidence": 0.0-1.0,
      "source": "llm"
    }
  ]
}`,
    },
  ]);

  return result.issues || [];
}

/**
 * 批量并行分析多个文件
 */
export async function analyzeFiles(
  files: ReviewContext["files"],
  relatedFiles: ReviewContext["relatedFiles"],
  batchSize = 10
): Promise<Issue[]> {
  const allIssues: Issue[] = [];

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((file) => {
        const related = (relatedFiles[file.path] || [])
          .map((r) => `// ${r.path}\n${r.content.slice(0, 3000)}`)
          .join("\n\n");
        return analyzeFileRisk(file, related);
      })
    );
    allIssues.push(...results.flat());
  }

  return allIssues;
}

// ========== Stage 3: Review 建议生成 ==========

interface SuggestionOutput {
  suggestion: Suggestion;
}

/**
 * 对单个问题生成修复建议
 */
export async function analyzeSuggestion(
  issue: Issue,
  context: { codeSnippet: string; fullContent: string }
): Promise<Suggestion | null> {
  if (!issue.severity || (issue.severity !== "CRITICAL" && issue.severity !== "HIGH")) {
    return null; // 只对高危问题生成建议
  }

  const result = await callFlash<SuggestionOutput>([
    {
      role: "user",
      content: `根据以下代码问题，生成可直接应用的修复建议。

## 问题信息
- 严重程度: ${issue.severity}
- 分类: ${issue.category}
- 标题: ${issue.title}
- 描述: ${issue.description}

## 问题代码
\`\`\`
${context.codeSnippet}
\`\`\`

## 所在文件完整上下文
\`\`\`
${context.fullContent.slice(0, 5000)}
\`\`\`

## 修复建议要求
1. 给出实际的代码修复示例（before / after）
2. 说明修复后的代码为什么安全/正确
3. 如果有替代方案也列出

## 输出 JSON 格式
{
  "suggestion": {
    "fixType": "CODE_CHANGE | ADD_VALIDATION | ADD_MIDDLEWARE",
    "description": "markdown 格式的修复说明",
    "codeBefore": "修复前代码",
    "codeAfter": "修复后代码",
    "alternatives": [{"approach": "替代方案描述", "code": "替代代码"}],
    "securityRationale": "安全性/正确性说明"
  }
}`,
    },
  ]);

  return result.suggestion || null;
}

// ========== 入口：完整分析流水线 ==========

export async function runFullAnalysis(context: ReviewContext) {
  console.log(`[Analysis] Stage 1/3: summarize (${context.files.length} files)`);
  const summary = await analyzeSummary(context);
  console.log(`[Analysis] Stage 1/3 完成`);

  console.log(`[Analysis] Stage 2/3: file risks (${context.files.length} files)`);
  const issues = await analyzeFiles(context.files, context.relatedFiles);
  console.log(`[Analysis] Stage 2/3 完成: ${issues.length} issues`);

  console.log(`[Analysis] Stage 3/3: suggestions for ${issues.filter(i => i.severity === "CRITICAL" || i.severity === "HIGH").length} high/critical issues`);
  for (const issue of issues) {
    if (issue.severity === "CRITICAL" || issue.severity === "HIGH") {
      const fullContent =
        context.files.find((f) => f.path === issue.filePath)?.fullContent || "";
      issue.suggestion = (await analyzeSuggestion(issue, {
        codeSnippet: issue.codeSnippet,
        fullContent,
      })) as Suggestion | undefined;
    }
  }

  // 计算综合评分
  const critical = issues.filter((i) => i.severity === "CRITICAL").length;
  const high = issues.filter((i) => i.severity === "HIGH").length;
  const medium = issues.filter((i) => i.severity === "MEDIUM").length;
  const score = Math.max(0, 100 - critical * 25 - high * 10 - medium * 3);

  let decision: string;
  let decisionReason: string;

  if (critical > 0) {
    decision = "REQUEST_CHANGES";
    decisionReason = `发现 ${critical} 个严重问题，需修复后重新提交`;
  } else if (high > 2 || score < 70) {
    decision = "COMMENT";
    decisionReason = `发现 ${high} 个高危问题和 ${medium} 个中危问题，建议审视后修改`;
  } else {
    decision = "APPROVE";
    decisionReason = "未发现严重问题，代码质量良好";
  }

  // 构建总结 markdown
  const summaryText = `## 变更总结

${summary.summary}

### 影响范围
${summary.impact}

### Review 关注重点
${summary.focusAreas.map((a) => `- ${a}`).join("\n")}

---

**文件变更**: ${context.files.length} 个 | **发现问题**: ${issues.length} 个`;

  console.log(`[Analysis] Stage 3/3 完成. score: ${score}, decision: ${decision}`);

  return {
    summary: summaryText,
    overallScore: score,
    decision,
    decisionReason,
    issues,
  };
}

import { Prisma } from "@prisma/client";
import { prisma } from "@/backend/lib/prisma";
import type { Issue, ReviewStatus, Decision, Suggestion } from "@/backend/types";

export type { ReviewStatus, Decision };

// ========== SSE 流式辅助 ==========

interface BufferedEvent {
  type: string;
  data: unknown;
}

function getBuffers(): Record<string, BufferedEvent[]> {
  const g = globalThis as Record<string, unknown>;
  if (!g.__reviewBuffers) g.__reviewBuffers = {};
  return g.__reviewBuffers as Record<string, BufferedEvent[]>;
}

function emitSSE(reviewId: string, type: string, data: unknown) {
  // 写入缓冲（供延迟连接的客户端回放）
  const buffers = getBuffers();
  if (!buffers[reviewId]) buffers[reviewId] = [];
  buffers[reviewId].push({ type, data });

  // 推送给已连接的客户端
  const streams = (globalThis as Record<string, unknown>).__reviewStreams as
    | Record<string, ReadableStreamDefaultController>
    | undefined;
  const ctrl = streams?.[reviewId];
  if (ctrl) {
    const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    ctrl.enqueue(new TextEncoder().encode(payload));
  }
}

/** 获取并清空 buffered events（SSE 端点 start() 时调用） */
export function drainBufferedEvents(reviewId: string): BufferedEvent[] {
  const buffers = getBuffers();
  const events = buffers[reviewId] || [];
  delete buffers[reviewId];
  return events;
}

/** 创建新的 Review 记录 */
export async function createReview(params: {
  prUrl: string;
  prTitle: string;
  repoName: string;
  branchFrom: string;
  branchTo: string;
  userId: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.review.create({
    data: {
      prUrl: params.prUrl,
      prTitle: params.prTitle,
      repoName: params.repoName,
      branchFrom: params.branchFrom,
      branchTo: params.branchTo,
      userId: params.userId,
      metadata: (params.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      status: "FETCHING",
    },
  });
}

/** 更新 Review 状态 */
export async function updateReviewStatus(
  reviewId: string,
  status: ReviewStatus,
  extra?: { summary?: string; overallScore?: number | null; decision?: Decision | null; decisionReason?: string | null }
) {
  return prisma.review.update({
    where: { id: reviewId },
    data: { status, ...extra },
  });
}

/** 获取 Review 详情 */
export async function getReview(reviewId: string) {
  return prisma.review.findUnique({
    where: { id: reviewId },
    include: {
      issues: { include: { feedbacks: true } },
      stageResults: { include: { issues: true } },
    },
  });
}

/** 获取用户的历史 Review 列表 */
export async function getUserReviews(userId: string, page = 1, pageSize = 20) {
  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        prUrl: true,
        prTitle: true,
        repoName: true,
        status: true,
        overallScore: true,
        decision: true,
        createdAt: true,
        _count: { select: { issues: true } },
      },
    }),
    prisma.review.count({ where: { userId } }),
  ]);

  return { reviews, total, page, pageSize };
}

/** 保存问题到 Review */
export async function saveIssues(
  reviewId: string,
  issues: Array<{
    filePath: string;
    lineStart: number;
    lineEnd: number;
    layer: string;
    severity: string;
    category: string;
    title: string;
    description: string;
    codeSnippet: string;
    confidence: number;
    source: string;
    ruleId?: string;
    stageResultId?: string;
    suggestion?: Suggestion | null;
  }>
) {
  return prisma.reviewIssue.createMany({
    data: issues.map(({ suggestion, ...issue }) => ({
      reviewId,
      ...issue,
      suggestion: suggestion ? (suggestion as unknown as Prisma.InputJsonValue) : undefined,
    })),
  });
}

/** 清除 Review 的所有问题 */
export async function clearIssues(reviewId: string) {
  return prisma.reviewIssue.deleteMany({
    where: { reviewId },
  });
}

/** 后台异步执行 AI 分析（不阻塞调用方，异常自行处理） */
export async function analyzePRInBackground(
  reviewId: string,
  prUrl: string,
  opts?: { onComplete?: () => Promise<void> }
) {
  console.log(`[Analysis:${reviewId}] ===== 后台分析开始 =====`);

  // 延迟导入避免循环依赖
  const { GitHubService } = await import("@/backend/lib/github");
  const { ContextBuilder } = await import("@/backend/services/context");
  const { analyzeSummaryStream, analyzeFileRisk, analyzeSuggestion, calculateScore } = await import("@/backend/services/analyzer");

  try {
    // 清空旧数据（增量保存需要干净起点）
    await clearIssues(reviewId);

    // Stage 1: 获取代码上下文
    console.log(`[Analysis:${reviewId}] Stage 1: 获取代码上下文...`);
    emitSSE(reviewId, "phase", { phase: "FETCHING", label: "获取代码上下文..." });
    await updateReviewStatus(reviewId, "FETCHING");
    const github = new GitHubService();
    const contextBuilder = new ContextBuilder(github);
    const context = await contextBuilder.build(prUrl);
    const totalFiles = context.files.length;
    console.log(`[Analysis:${reviewId}] Stage 1 完成: ${totalFiles} 个文件, commits: ${context.commits.length}`);

    // Stage 1.5: RAG 反馈预热（用 PR 描述 + 标题做语义检索）
    const { retrieveFeedbackExamples } = await import("@/backend/services/feedback-learner");
    const ragQuery = `${context.prTitle}\n${context.prDescription || ""}`.slice(0, 1000);
    const ragResults = await retrieveFeedbackExamples(ragQuery, "backend"); // 默认检索后端，后续按文件 layer 调整
    const hasRag = ragResults.length > 0;
    console.log(`[Analysis:${reviewId}] RAG 预热完成: ${ragResults.length} 条历史反馈命中`);

    // Stage 1.6: Semgrep 静态分析预处理
    const { runSemgrepScan: runSemgrep, getSemgrepCoveredCategories } =
      await import("@/backend/services/static-analyzer");
    const semgrepIssues = runSemgrep(context.files.map((f) => f.path));
    const coveredCats = getSemgrepCoveredCategories(semgrepIssues);
    console.log(`[Analysis:${reviewId}] Semgrep 完成: ${semgrepIssues.length} 个确定性问题, 覆盖 ${coveredCats.length} 个类别`);
    if (semgrepIssues.length > 0) {
      // 保存 Semgrep 结果并推送
      await saveIssues(reviewId, semgrepIssues.map((i) => ({
        ...i,
        id: `${reviewId}-${i.id}`,
      })));
      for (const issue of semgrepIssues) {
        emitSSE(reviewId, "issue", issue);
      }
    }

    // Stage 1.7: 加载审查策略（ReviewPolicy）
    const { filterFilesByPolicy, filterIssuesByPolicy, getSeverityWeights } =
      await import("@/backend/lib/review-policy");
    const reviewRecord = await prisma.review.findUnique({
      where: { id: reviewId },
      select: { policy: { select: { config: true } } },
    });
    const policyConfig = reviewRecord?.policy?.config as
      | import("@/backend/types").ReviewPolicyConfig
      | undefined;
    if (policyConfig) {
      console.log(`[Analysis:${reviewId}] 已加载审查策略, minConfidence: ${policyConfig.minConfidence}, ignorePatterns: ${policyConfig.ignorePatterns?.length ?? 0}`);
      // 按策略过滤文件
      const beforeCount = context.files.length;
      context.files = filterFilesByPolicy(context.files, policyConfig);
      console.log(`[Analysis:${reviewId}] 策略过滤: ${beforeCount} → ${context.files.length} 个文件`);
    }

    // Stage 2: 流式总结 + 文件风险分析（增量保存）
    console.log(`[Analysis:${reviewId}] Stage 2: AI 分析中...`);
    emitSSE(reviewId, "phase", { phase: "ANALYZING", label: "AI 分析中..." });
    await updateReviewStatus(reviewId, "ANALYZING");

    // 2a: 流式总结
    const summary = await analyzeSummaryStream(
      context,
      (delta) => {
        emitSSE(reviewId, "token", { content: delta });
      },
      { reviewId, stage: "summary" }
    );
    console.log(`[Analysis:${reviewId}] 总结完成`);

    // 2b: 文件风险分析（分批并行，每批完成后增量保存）
    const allIssues: Issue[] = [];
    const batchSize = 10;

    for (let i = 0; i < context.files.length; i += batchSize) {
      const batch = context.files.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((file) => {
          const related = (context.relatedFiles[file.path] || [])
            .map((r) => `// ${r.path}\n${r.content.slice(0, 3000)}`)
            .join("\n\n");
          return analyzeFileRisk(file, related, { reviewId, stage: "file-risk" }, hasRag ? ragResults : undefined, coveredCats);
        })
      );
      const batchIssues = batchResults.flat();
      allIssues.push(...batchIssues);

      // 增量保存：发现问题立即入库，前端轮询立即可见
      if (batchIssues.length > 0) {
        await saveIssues(reviewId, batchIssues.map((issue) => ({
          filePath: issue.filePath,
          lineStart: issue.lineStart,
          lineEnd: issue.lineEnd,
          layer: issue.layer,
          severity: issue.severity,
          category: issue.category,
          title: issue.title,
          description: issue.description,
          codeSnippet: issue.codeSnippet,
          confidence: issue.confidence,
          source: issue.source,
        })));
      }

      const analyzed = Math.min(i + batchSize, totalFiles);
      emitSSE(reviewId, "progress", {
        analyzed,
        totalFiles,
        totalIssues: allIssues.length,
      });
      console.log(`[Analysis:${reviewId}] 文件分析进度: ${analyzed}/${totalFiles}, 已发现 ${allIssues.length} 个问题`);
    }

    const issues = allIssues;
    console.log(`[Analysis:${reviewId}] 文件分析完成: ${issues.length} issues`);

    // Stage 3: 修复建议（逐条生成 + 更新 DB）
    const highCritical = issues.filter(i => i.severity === "CRITICAL" || i.severity === "HIGH");
    console.log(`[Analysis:${reviewId}] Stage 3: suggestions for ${highCritical.length} high/critical issues`);
    emitSSE(reviewId, "phase", { phase: "SUGGESTING", label: `生成 ${highCritical.length} 条修复建议...` });
    emitSSE(reviewId, "progress", {
      analyzed: totalFiles,
      totalFiles,
      totalIssues: issues.length,
      suggestionCurrent: 0,
      suggestionTotal: highCritical.length,
    });
    let suggestionDone = 0;
    let suggestionErrors = 0;
    for (const issue of issues) {
      if (issue.severity === "CRITICAL" || issue.severity === "HIGH") {
        const fullContent =
          context.files.find((f) => f.path === issue.filePath)?.fullContent || "";
        try {
          issue.suggestion = (await analyzeSuggestion(
            issue,
            { codeSnippet: issue.codeSnippet, fullContent },
            { reviewId, stage: "suggestion" }
          )) as Suggestion | undefined;

          if (issue.suggestion) {
            await prisma.reviewIssue.updateMany({
              where: {
                reviewId,
                filePath: issue.filePath,
                lineStart: issue.lineStart,
                title: issue.title,
              },
              data: {
                suggestion: issue.suggestion as unknown as Prisma.InputJsonValue,
              },
            });
          }
        } catch (err) {
          suggestionErrors++;
          console.error(`[Analysis:${reviewId}] 建议生成失败 (${issue.title}):`, (err as Error).message);
        }
        suggestionDone++;
        emitSSE(reviewId, "progress", {
          analyzed: totalFiles,
          totalFiles,
          totalIssues: issues.length,
          suggestionCurrent: suggestionDone,
          suggestionTotal: highCritical.length,
        });
      }
    }
    if (suggestionErrors > 0) {
      console.warn(`[Analysis:${reviewId}] ${suggestionErrors}/${highCritical.length} 条建议生成失败，跳过`);
    }

    // 合并 Semgrep 静态分析结果
    const mergedIssues = [...semgrepIssues, ...issues];

    // 按策略过滤低置信度问题（Semgrep 1.0 不受影响）
    const filteredIssues = filterIssuesByPolicy(mergedIssues, policyConfig);
    if (filteredIssues.length < mergedIssues.length) {
      console.log(`[Analysis:${reviewId}] 策略过滤: ${mergedIssues.length} → ${filteredIssues.length} 个问题`);
    }
    if (filteredIssues.length < issues.length) {
      console.log(`[Analysis:${reviewId}] 策略过滤: ${issues.length} → ${filteredIssues.length} 个问题`);
    }

    // 计算评分（含 PR 规模归一化 + 置信度加权 + 策略自定义权重）
    const totalAdditions = context.files.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = context.files.reduce((sum, f) => sum + f.deletions, 0);
    const critical = filteredIssues.filter((i) => i.severity === "CRITICAL").length;
    const high = filteredIssues.filter((i) => i.severity === "HIGH").length;
    const medium = filteredIssues.filter((i) => i.severity === "MEDIUM").length;
    const severityWeights = getSeverityWeights(policyConfig);
    const score = calculateScore(filteredIssues, { totalAdditions, totalDeletions, severityWeights });

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

    const summaryText = `## 变更总结

${summary.summary}

### 影响范围
${summary.impact}

### Review 关注重点
${summary.focusAreas.map((a) => `- ${a}`).join("\n")}

---

**文件变更**: ${context.files.length} 个 | **发现问题**: ${filteredIssues.length} 个`;

    // 发送完成事件
    emitSSE(reviewId, "complete", {
      overallScore: score,
      decision,
      totalIssues: filteredIssues.length,
    });

    await updateReviewStatus(reviewId, "COMPLETED", {
      summary: summaryText,
      overallScore: score,
      decision: decision as "APPROVE" | "COMMENT" | "REQUEST_CHANGES",
      decisionReason,
    });
    console.log(`[Analysis:${reviewId}] ===== 分析完成 =====`);

    // 可选回调（如 webhook 触发的分析完成后发 PR 评论）
    if (opts?.onComplete) {
      try {
        await opts.onComplete();
      } catch (cbError) {
        console.error(`[Analysis:${reviewId}] onComplete 回调失败:`, cbError);
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Analysis:${reviewId}] ===== 分析失败 =====`, msg);
    emitSSE(reviewId, "error", { error: msg });
    try { await updateReviewStatus(reviewId, "FAILED"); } catch { /* ignore */ }
  }
}

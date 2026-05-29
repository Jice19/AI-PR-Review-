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
      issues: true,
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
export async function analyzePRInBackground(reviewId: string, prUrl: string) {
  console.log(`[Analysis:${reviewId}] ===== 后台分析开始 =====`);

  // 延迟导入避免循环依赖
  const { GitHubService } = await import("@/backend/lib/github");
  const { ContextBuilder } = await import("@/backend/services/context");
  const { analyzeSummaryStream, analyzeFileRisk, analyzeSuggestion } = await import("@/backend/services/analyzer");

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

    // Stage 2: 流式总结 + 文件风险分析（增量保存）
    console.log(`[Analysis:${reviewId}] Stage 2: AI 分析中...`);
    emitSSE(reviewId, "phase", { phase: "ANALYZING", label: "AI 分析中..." });
    await updateReviewStatus(reviewId, "ANALYZING");

    // 2a: 流式总结
    const summary = await analyzeSummaryStream(context, (delta) => {
      emitSSE(reviewId, "token", { content: delta });
    });
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
          return analyzeFileRisk(file, related);
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
    for (const issue of issues) {
      if (issue.severity === "CRITICAL" || issue.severity === "HIGH") {
        const fullContent =
          context.files.find((f) => f.path === issue.filePath)?.fullContent || "";
        issue.suggestion = (await analyzeSuggestion(issue, {
          codeSnippet: issue.codeSnippet,
          fullContent,
        })) as Suggestion | undefined;

        // 增量更新 suggestion 到 DB
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
      }
    }

    // 计算评分
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

    const summaryText = `## 变更总结

${summary.summary}

### 影响范围
${summary.impact}

### Review 关注重点
${summary.focusAreas.map((a) => `- ${a}`).join("\n")}

---

**文件变更**: ${context.files.length} 个 | **发现问题**: ${issues.length} 个`;

    // 发送完成事件
    emitSSE(reviewId, "complete", {
      overallScore: score,
      decision,
      totalIssues: issues.length,
    });

    await updateReviewStatus(reviewId, "COMPLETED", {
      summary: summaryText,
      overallScore: score,
      decision: decision as "APPROVE" | "COMMENT" | "REQUEST_CHANGES",
      decisionReason,
    });
    console.log(`[Analysis:${reviewId}] ===== 分析完成 =====`);
  } catch (error) {
    console.error(`[Analysis:${reviewId}] ===== 分析失败 =====`, error);
    emitSSE(reviewId, "error", { error: "分析失败" });
    await updateReviewStatus(reviewId, "FAILED");
  }
}

import { Prisma } from "@prisma/client";
import { prisma } from "@/backend/lib/prisma";
import type { ReviewStatus, Decision } from "@/backend/types";

export type { ReviewStatus, Decision };

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
  }>
) {
  return prisma.reviewIssue.createMany({
    data: issues.map((issue) => ({
      reviewId,
      ...issue,
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
  const { runFullAnalysis } = await import("@/backend/services/analyzer");

  try {
    console.log(`[Analysis:${reviewId}] Step 1: 获取代码上下文...`);
    await updateReviewStatus(reviewId, "FETCHING");
    const github = new GitHubService();
    const contextBuilder = new ContextBuilder(github);
    const context = await contextBuilder.build(prUrl);
    console.log(`[Analysis:${reviewId}] Step 1 完成: ${context.files.length} 个文件, commits: ${context.commits.length}`);

    console.log(`[Analysis:${reviewId}] Step 2: AI 分析中...`);
    await updateReviewStatus(reviewId, "ANALYZING");
    const result = await runFullAnalysis(context);
    console.log(`[Analysis:${reviewId}] Step 2 完成: ${result.issues.length} 个问题, score: ${result.overallScore}`);

    console.log(`[Analysis:${reviewId}] Step 3: 保存结果...`);
    await saveIssues(reviewId, result.issues.map((issue) => ({
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

    console.log(`[Analysis:${reviewId}] Step 4: 标记完成...`);
    await updateReviewStatus(reviewId, "COMPLETED", {
      summary: result.summary,
      overallScore: result.overallScore,
      decision: result.decision as "APPROVE" | "COMMENT" | "REQUEST_CHANGES",
      decisionReason: result.decisionReason,
    });
    console.log(`[Analysis:${reviewId}] ===== 分析完成 =====`);
  } catch (error) {
    console.error(`[Analysis:${reviewId}] ===== 分析失败 =====`, error);
    await updateReviewStatus(reviewId, "FAILED");
  }
}

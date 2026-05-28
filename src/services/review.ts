import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ReviewStatus, Decision } from "@/types";

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

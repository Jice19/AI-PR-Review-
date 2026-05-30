/**
 * ReviewPolicy 策略引擎
 *
 * 将 ReviewPolicyConfig 应用到分析流程中：
 * 1. 文件过滤 — ignorePatterns 跳过不审查的文件
 * 2. 问题过滤 — minConfidence 阈值剔除低置信度问题
 * 3. 评分权重 — severityWeights 替代默认权重
 */

import type { ReviewPolicyConfig, Issue, FileContext } from "@/backend/types";

/** 默认严重程度权重，当 policy 未指定时使用 */
export const DEFAULT_SEVERITY_WEIGHTS: Record<string, number> = {
  CRITICAL: 25,
  HIGH: 10,
  MEDIUM: 3,
  LOW: 1,
};

/** 默认最低置信度阈值 */
export const DEFAULT_MIN_CONFIDENCE = 0.5;

/**
 * 按 ignorePatterns 过滤文件列表
 */
export function filterFilesByPolicy(
  files: FileContext[],
  policy?: ReviewPolicyConfig | null
): FileContext[] {
  if (!policy?.ignorePatterns?.length) return files;

  const patterns = policy.ignorePatterns.map((p) => new RegExp(p));
  return files.filter((f) => !patterns.some((re) => re.test(f.path)));
}

/**
 * 按 minConfidence 阈值过滤问题
 */
export function filterIssuesByPolicy(
  issues: Issue[],
  policy?: ReviewPolicyConfig | null
): Issue[] {
  const threshold = policy?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  return issues.filter((i) => i.confidence >= threshold);
}

/**
 * 获取策略配置的严重程度权重（合并默认值）
 */
export function getSeverityWeights(
  policy?: ReviewPolicyConfig | null
): Record<string, number> {
  if (!policy?.severityWeights) return DEFAULT_SEVERITY_WEIGHTS;
  return { ...DEFAULT_SEVERITY_WEIGHTS, ...policy.severityWeights };
}

/**
 * 获取最低置信度阈值
 */
export function getMinConfidence(policy?: ReviewPolicyConfig | null): number {
  return policy?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
}

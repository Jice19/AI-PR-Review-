import { NextRequest, NextResponse } from "next/server";
import { parsePRUrl, GitHubService } from "@/backend/lib/github";
import { prisma } from "@/backend/lib/prisma";
import { createReview, analyzePRInBackground } from "@/backend/services/review";

const SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
};

const DECISION_EMOJI: Record<string, string> = {
  APPROVE: "✅",
  COMMENT: "💬",
  REQUEST_CHANGES: "❌",
};

function buildPRCommentMarkdown(review: {
  prTitle: string;
  summary: string | null;
  overallScore: number | null;
  decision: string | null;
  decisionReason: string | null;
  issues: Array<{
    severity: string;
    title: string;
    filePath: string;
    lineStart: number;
    description: string;
    suggestion?: unknown;
  }>;
}): string {
  const issues = review.issues || [];
  const totalIssues = issues.length;

  // Count by severity
  const countBySev: Record<string, number> = {};
  for (const i of issues) {
    countBySev[i.severity] = (countBySev[i.severity] || 0) + 1;
  }

  const score = review.overallScore ?? null;
  const decisionEmoji = DECISION_EMOJI[review.decision || ""] || "";
  const decisionLabel = review.decision || "N/A";

  const lines: string[] = [];

  lines.push(`## ${decisionEmoji} AI Code Review: ${review.prTitle}`);
  lines.push("");

  // Score + Decision badge
  if (score !== null) {
    const scoreColor = score >= 80 ? "green" : score >= 60 ? "orange" : "red";
    lines.push(`| | |`);
    lines.push(`|---|---|`);
    lines.push(`| **Score** | ![](https://img.shields.io/badge/${score}%2F100-${scoreColor}) |`);
    lines.push(`| **Decision** | ${decisionEmoji} ${decisionLabel}${review.decisionReason ? ` — ${review.decisionReason}` : ""} |`);
    lines.push("");
  }

  // Issue summary
  if (totalIssues > 0) {
    lines.push(`### Issues Found: ${totalIssues}`);
    lines.push("");
    const parts: string[] = [];
    if (countBySev.CRITICAL) parts.push(`${countBySev.CRITICAL} critical`);
    if (countBySev.HIGH) parts.push(`${countBySev.HIGH} high`);
    if (countBySev.MEDIUM) parts.push(`${countBySev.MEDIUM} medium`);
    if (countBySev.LOW) parts.push(`${countBySev.LOW} low`);
    lines.push(`> ${parts.join(" · ")}`);
    lines.push("");

    // Top issues by severity
    const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
    for (const sev of severityOrder) {
      const sevIssues = issues.filter((i) => i.severity === sev);
      if (sevIssues.length === 0) continue;

      lines.push(`<details>`);
      lines.push(`<summary><strong>${SEVERITY_LABELS[sev]}</strong> (${sevIssues.length})</summary>`);
      lines.push("");
      for (const issue of sevIssues) {
        lines.push(`- **${issue.title}** — \`${issue.filePath}:${issue.lineStart}\``);
        lines.push(`  ${issue.description.slice(0, 200)}`);
        if (issue.suggestion) {
          const sug = issue.suggestion as Record<string, unknown>;
          if (sug.description) {
            lines.push(`  > 💡 ${sug.description}`);
          }
        }
      }
      lines.push("");
      lines.push(`</details>`);
      lines.push("");
    }
  } else {
    lines.push("### ✅ No Issues Found");
    lines.push("");
    lines.push("Code quality looks good, no issues were detected.");
    lines.push("");
  }

  // Summary excerpt
  if (review.summary) {
    lines.push("---");
    lines.push("");
    lines.push("<details>");
    lines.push("<summary>Full Summary</summary>");
    lines.push("");
    lines.push(review.summary.slice(0, 5000));
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  lines.push("---");
  lines.push(`*Automated review by [AI Preview Tool](https://github.com)*`);

  return lines.join("\n");
}

async function getSystemUserId(): Promise<string | null> {
  // 优先使用环境变量指定的用户 ID
  if (process.env.WEBHOOK_SYSTEM_USER_ID) {
    const user = await prisma.user.findUnique({
      where: { id: process.env.WEBHOOK_SYSTEM_USER_ID },
    });
    if (user) return user.id;
  }

  // 回退: 查找邮箱匹配的系统用户
  if (process.env.SYSTEM_USER_EMAIL) {
    const user = await prisma.user.findFirst({
      where: { email: process.env.SYSTEM_USER_EMAIL },
    });
    if (user) return user.id;
  }

  // 最终回退: 使用数据库中的第一个用户
  const firstUser = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  return firstUser?.id || null;
}

async function verifyWebhookSignature(request: NextRequest): Promise<boolean> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[Webhook] GITHUB_WEBHOOK_SECRET 未设置，跳过签名验证");
    return true; // 开发环境下不验证
  }

  const signature = request.headers.get("x-hub-signature-256");
  if (!signature) {
    console.warn("[Webhook] 缺少 x-hub-signature-256 头");
    return false;
  }

  const body = await request.clone().text();

  // Web Crypto HMAC-SHA256
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const sigBytes = new Uint8Array(
    signature.slice(7).match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
  );

  return crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(body));
}

export async function POST(request: NextRequest) {
  let event: string | null = null;
  let deliveryId: string | null = null;

  try {
    event = request.headers.get("x-github-event");
    deliveryId = request.headers.get("x-github-delivery");

    console.log(`[Webhook] 收到事件: ${event}, delivery: ${deliveryId}`);

    // 验证签名
    const valid = await verifyWebhookSignature(request);
    if (!valid) {
      console.error("[Webhook] 签名验证失败");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const body = await request.json();

    // 只处理 PR 事件
    if (event !== "pull_request") {
      console.log(`[Webhook] 忽略非 PR 事件: ${event}`);
      return NextResponse.json({ message: "ignored" });
    }

    const action = body.action;
    if (!["opened", "synchronize"].includes(action)) {
      console.log(`[Webhook] 忽略 PR action: ${action}`);
      return NextResponse.json({ message: "ignored" });
    }

    const prUrl = body.pull_request?.html_url;
    if (!prUrl) {
      return NextResponse.json({ error: "Missing PR URL" }, { status: 400 });
    }

    // 获取系统用户
    const userId = await getSystemUserId();
    if (!userId) {
      console.error("[Webhook] 无可用用户，无法创建 Review");
      return NextResponse.json({ error: "No user available" }, { status: 500 });
    }

    // 解析 PR 信息
    const prInfo = parsePRUrl(prUrl);
    const github = new GitHubService();
    const meta = await github.getPRMeta(prInfo.owner, prInfo.repo, prInfo.prNumber);

    // 创建 Review 记录
    const review = await createReview({
      prUrl,
      prTitle: meta.title,
      repoName: `${prInfo.owner}/${prInfo.repo}`,
      branchFrom: meta.branchFrom,
      branchTo: meta.branchTo,
      userId,
      metadata: {
        filesChanged: meta.filesChanged,
        additions: meta.additions,
        deletions: meta.deletions,
        source: "webhook",
      },
    });

    console.log(`[Webhook] Review 已创建: ${review.id}, PR: ${meta.title}`);

    // 后台分析 + 完成后自动发 PR 评论
    analyzePRInBackground(review.id, prUrl, {
      onComplete: async () => {
        // 重新获取 review 以拿到完整的 issues + suggestions
        const completedReview = await prisma.review.findUnique({
          where: { id: review.id },
          include: { issues: true },
        });
        if (!completedReview || completedReview.status !== "COMPLETED") return;

        const commentBody = buildPRCommentMarkdown({
          prTitle: completedReview.prTitle,
          summary: completedReview.summary,
          overallScore: completedReview.overallScore,
          decision: completedReview.decision,
          decisionReason: completedReview.decisionReason,
          issues: completedReview.issues.map((i) => ({
            severity: i.severity,
            title: i.title,
            filePath: i.filePath,
            lineStart: i.lineStart,
            description: i.description,
            suggestion: i.suggestion,
          })),
        });

        // 查找是否已有一条 AI review 评论（用于 synchronize 事件时更新而非重复发）
        await github.postPRComment(prInfo.owner, prInfo.repo, prInfo.prNumber, commentBody);
        console.log(`[Webhook] PR 评论已发布: ${prInfo.owner}/${prInfo.repo}#${prInfo.prNumber}`);
      },
    }).catch((err) => {
      console.error(`[Webhook] 后台分析异常:`, err);
    });

    return NextResponse.json({
      id: review.id,
      status: review.status,
      message: "Analysis started",
    });
  } catch (error) {
    console.error(`[Webhook] 处理失败 (event=${event}, delivery=${deliveryId}):`, error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

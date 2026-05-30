import { NextRequest, NextResponse } from "next/server";
import { parsePRUrl, GitHubService } from "@/backend/lib/github";
import { prisma } from "@/backend/lib/prisma";
import { createReview, analyzePRInBackground } from "@/backend/services/review";
import { buildPRComment } from "@/backend/lib/pr-comment";

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

        const commentBody = buildPRComment({
          prTitle: completedReview.prTitle,
          summary: completedReview.summary,
          overallScore: completedReview.overallScore,
          decision: completedReview.decision,
          decisionReason: completedReview.decisionReason,
          issues: completedReview.issues.map((i) => ({
            filePath: i.filePath,
            lineStart: i.lineStart,
            severity: i.severity,
            category: i.category,
            title: i.title,
            description: i.description,
            codeSnippet: i.codeSnippet,
            suggestion: i.suggestion as { description?: string } | null,
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

import { NextRequest, NextResponse } from "next/server";
import { parsePRUrl, GitHubService } from "@/backend/lib/github";
import { requireAuth } from "@/backend/lib/session";
import { createReview, analyzePRInBackground } from "@/backend/services/review";

export async function POST(request: NextRequest) {
  try {
    // 鉴权
    const session = await requireAuth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    // 解析请求
    const body = await request.json();
    const { prUrl } = body;

    if (!prUrl || typeof prUrl !== "string") {
      return NextResponse.json({ error: "请提供 PR URL" }, { status: 400 });
    }

    // 解析 PR URL
    let prInfo;
    try {
      prInfo = parsePRUrl(prUrl);
    } catch {
      return NextResponse.json({ error: "无效的 GitHub PR URL" }, { status: 400 });
    }

    // 获取 PR 元信息
    const github = new GitHubService();
    const meta = await github.getPRMeta(prInfo.owner, prInfo.repo, prInfo.prNumber);

    // 创建 Review 记录
    const review = await createReview({
      prUrl,
      prTitle: meta.title,
      repoName: `${prInfo.owner}/${prInfo.repo}`,
      branchFrom: meta.branchFrom,
      branchTo: meta.branchTo,
      userId: session.user.id,
      metadata: {
        filesChanged: meta.filesChanged,
        additions: meta.additions,
        deletions: meta.deletions,
      },
    });

    // 异步启动分析（不阻塞 HTTP 响应）
    analyzePRInBackground(review.id, prUrl).catch(console.error);

    return NextResponse.json({ id: review.id, status: review.status });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    console.error("创建 Review 失败:", error);
    return NextResponse.json({ error: "分析请求失败" }, { status: 500 });
  }
}

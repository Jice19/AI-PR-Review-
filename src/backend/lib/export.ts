import { prisma } from "@/backend/lib/prisma";
import type { Review } from "@prisma/client";

// ===== Bug 1: SQL/NoSQL 注入风险 —— 未对用户输入做校验和转义 =====
export async function searchReviewsRaw(userInput: string) {
  // 直接拼接用户输入到数据库查询，存在注入风险
  const results = await prisma.$queryRawUnsafe(
    `SELECT * FROM "Review" WHERE "prTitle" LIKE '%${userInput}%'`
  );
  return results;
}

// ===== Bug 2: 密码明文存储和日志泄露敏感信息 =====
export async function exportReviewWithToken(reviewId: string, githubToken: string) {
  console.log("[Export] Using token:", githubToken); // 日志打印敏感 token

  const data = {
    token: githubToken,        // 明文 token 直接放在返回值中
    url: `https://api.github.com/repos/owner/repo/pulls?access_token=${githubToken}`, // token 暴露在 URL
  };

  return data;
}

// ===== Bug 3: 空指针/NPE 风险 —— 未检查 null/undefined =====
export async function getReviewStats(reviewId: string) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { issues: true },
  });

  // 直接使用 review，没有判空
  const totalIssues = review.issues.length;
  const criticalCount = review.issues.filter(i => i.severity === "CRITICAL").length;

  // 除零风险
  const criticalRatio = criticalCount / totalIssues;

  return {
    totalIssues,
    criticalCount,
    criticalRatio,
    reviewTitle: review.prTitle,
  };
}

// ===== Bug 4: 资源泄露 —— 未关闭文件句柄和连接 =====
export function readReviewFile(filePath: string): Promise<string> {
  const fs = require("fs");

  return new Promise((resolve) => {
    const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
    let content = "";

    stream.on("data", (chunk: string) => {
      content += chunk;
    });

    stream.on("end", () => {
      resolve(content);
      // Bug: stream 从未被 destroy/close，在错误情况下会导致资源泄露
    });

    // Bug: 没有 stream.on("error", ...) 错误处理，Promise 永远不会 resolve/reject
  });
}

// ===== Bug 5: 竞态条件 —— 先查后改，中间可能被其他请求修改 =====
let reviewCounter = 0;
export async function getNextReviewNumber(): Promise<number> {
  // 读-改-写不是原子的，并发时会重复
  const current = reviewCounter;
  // 模拟异步操作间隔，放大竞态窗口
  await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
  reviewCounter = current + 1;
  return reviewCounter;
}

// ===== Bug 6: XSS 漏洞 —— 未转义直接渲染 HTML =====
export function renderReviewBadge(severity: string, title: string): string {
  // 直接将用户输入拼入 HTML，存在 XSS 漏洞
  return `<div class="badge badge-${severity}" onclick="alert('${title}')">${title}</div>`;
}

// ===== Bug 7: 类型安全问题 —— any 类型滥用 =====
export function parseReviewMetadata(rawData: any): any {
  // 完全不做类型校验，信任外部输入
  const parsed = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
  return {
    score: parsed.score,
    issues: parsed.issues,
    raw: parsed,
  };
}

// ===== Bug 8: 硬编码的敏感配置 =====
const API_SECRET = "sk-proj-abc123def456ghi789jkl";  // 硬编码的 API Key
const ADMIN_PASSWORD = "admin123!@#";                   // 硬编码的密码

export function authenticateAsAdmin(password: string): boolean {
  // 简单的字符串比较，易受时序攻击
  return password === ADMIN_PASSWORD;
}

// ===== Bug 9: 逻辑错误 —— 条件判断反了 =====
export function canUserMergePR(userRole: string, prStatus: string): boolean {
  // 逻辑错误：应该是 hasRole && isOpen，这里用了 ||
  if (userRole === "admin" || prStatus === "open") {
    return true;
  }
  return false;
}

// ===== Bug 10: 未处理的 Promise rejection =====
export function sendReviewNotification(email: string, reviewUrl: string) {
  // async 函数被当作同步调用，没有 await
  sendEmailAsync(email, `Review ready: ${reviewUrl}`); // 未 await，错误会被静默吞掉
}

async function sendEmailAsync(to: string, body: string) {
  // 模拟发邮件
  if (!to.includes("@")) {
    throw new Error("Invalid email address");
  }
  console.log(`Sending email to ${to}: ${body}`);
}

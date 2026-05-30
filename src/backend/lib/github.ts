import { Octokit } from "@octokit/rest";
import type { FileContext, Layer, ReviewContext } from "@/backend/types";

// ========== PR URL 解析 ==========

interface PRInfo {
  owner: string;
  repo: string;
  prNumber: number;
}

/**
 * 解析 GitHub PR URL
 * 支持格式: https://github.com/{owner}/{repo}/pull/{number}
 */
export function parsePRUrl(url: string): PRInfo {
  const match = url.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/);
  if (!match) {
    throw new Error("Invalid GitHub PR URL");
  }
  return {
    owner: match[1],
    repo: match[2],
    prNumber: parseInt(match[3], 10),
  };
}

// ========== 文件层级分类 ==========

const LAYER_RULES: { pattern: RegExp; layer: Layer }[] = [
  // 前端
  { pattern: /\.(tsx|jsx|vue)$/, layer: "frontend" },
  { pattern: /\/components?\//, layer: "frontend" },
  { pattern: /\/pages?\//, layer: "frontend" },
  { pattern: /\/hooks?\//, layer: "frontend" },
  { pattern: /\.(css|scss|less|module\.css)$/, layer: "frontend" },
  // 数据库
  { pattern: /\.(prisma|sql)$/, layer: "database" },
  { pattern: /\/migrations?\//, layer: "database" },
  { pattern: /\/models?\//, layer: "database" },
  // 配置
  { pattern: /\.(ya?ml|json|toml)$/, layer: "config" },
  { pattern: /Dockerfile/, layer: "config" },
  { pattern: /docker-compose/, layer: "config" },
  { pattern: /\/\.(github|ci)\//, layer: "config" },
  // 其余都归为后端
  { pattern: /\.ts$/, layer: "backend" },
  { pattern: /\.js$/, layer: "backend" },
  { pattern: /\/services?\//, layer: "backend" },
  { pattern: /\/controllers?\//, layer: "backend" },
  { pattern: /\/middlewares?\//, layer: "backend" },
];

export function classifyFileLayer(filePath: string): Layer {
  for (const { pattern, layer } of LAYER_RULES) {
    if (pattern.test(filePath)) return layer;
  }
  return "backend"; // 默认归为后端
}

// ========== GitHub API 服务 ==========

export class GitHubService {
  private octokit: Octokit;

  constructor(token?: string) {
    this.octokit = new Octokit({
      auth: token || process.env.GITHUB_TOKEN,
    });
  }

  /** 获取 PR 元信息 */
  async getPRMeta(owner: string, repo: string, prNumber: number) {
    const { data } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    return {
      title: data.title,
      description: data.body || "",
      branchFrom: data.head.ref,
      branchTo: data.base.ref,
      additions: data.additions ?? 0,
      deletions: data.deletions ?? 0,
      filesChanged: data.changed_files ?? 0,
    };
  }

  /** 获取 PR 变更文件列表 (含 patch) */
  async getPRFiles(owner: string, repo: string, prNumber: number) {
    const { data } = await this.octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });

    return data.map((file) => ({
      filename: file.filename,
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch || "",
      status: file.status, // added | modified | removed | renamed
    }));
  }

  /** 获取文件完整内容 */
  async getFileContent(owner: string, repo: string, path: string, ref: string) {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      if ("content" in data && data.content) {
        return Buffer.from(data.content, "base64").toString("utf-8");
      }
      return null;
    } catch {
      // 文件可能不存在 (新增文件在 base 分支上不存在)
      return null;
    }
  }

  /** 获取 PR 的 commit 历史 */
  async getPRCommits(owner: string, repo: string, prNumber: number) {
    const { data } = await this.octokit.rest.pulls.listCommits({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 20,
    });

    return data.map((commit) => ({
      sha: commit.sha,
      message: commit.commit.message,
    }));
  }

  /** 获取仓库根目录文件结构 (用于理解项目架构) */
  async getRepoTree(owner: string, repo: string, ref: string) {
    try {
      const { data } = await this.octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: ref,
      });
      return data.tree.map((item) => ({
        path: item.path || "",
        type: item.type || "blob",
      }));
    } catch {
      return [];
    }
  }

  /** 向 PR 发布评论 */
  async postPRComment(
    owner: string,
    repo: string,
    prNumber: number,
    body: string
  ) {
    await this.octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
  }

  /** 一站式获取 PR 完整上下文 */
  async fetchReviewContext(url: string): Promise<ReviewContext> {
    const { owner, repo, prNumber } = parsePRUrl(url);

    // 并行获取 PR 元信息、文件列表、commit 历史（元信息先获取，repoTree 依赖它）
    const meta = await this.getPRMeta(owner, repo, prNumber);
    const [files, commits, repoTree] = await Promise.all([
      this.getPRFiles(owner, repo, prNumber),
      this.getPRCommits(owner, repo, prNumber),
      this.getRepoTree(owner, repo, meta.branchTo),
    ]);

    // 构建文件上下文 (并行获取全部变更文件的全文)
    const fileContexts: FileContext[] = await Promise.all(
      files
        .filter((f) => f.status !== "removed") // 跳过已删除文件
        .map(async (file) => {
          const layer = classifyFileLayer(file.filename);
          const fullContent =
            (await this.getFileContent(owner, repo, file.filename, meta.branchTo)) || "";

          return {
            path: file.filename,
            layer,
            diff: file.patch,
            fullContent,
            additions: file.additions,
            deletions: file.deletions,
            contentHash: "", // 由调用方填充
          };
        })
    );

    return {
      owner,
      repo,
      prNumber,
      prTitle: meta.title,
      prDescription: meta.description,
      branchFrom: meta.branchFrom,
      branchTo: meta.branchTo,
      commits,
      files: fileContexts,
      relatedFiles: {}, // 由 ContextBuilder 填充
      projectConfig: {
        tsconfig: {},
        packageJson: {},
      },
    };
  }
}

import crypto from "crypto";
import { GitHubService } from "@/lib/github";
import type { ReviewContext, RelatedContext } from "@/types";

export class ContextBuilder {
  constructor(private github: GitHubService) {}

  /** 计算文件内容的 SHA256 hash */
  private hashContent(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex").substring(0, 16);
  }

  /**
   * 从 GitHub API 返回的变更文件中提取项目内部 import
   * 简化版 AST：用正则匹配 import/require 语句
   */
  extractInternalImports(fileContent: string): string[] {
    const symbols: string[] = [];
    // ES import: import { X } from '@/xxx' / import { X } from './xxx'
    const esImportRe = /import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+["'](@\/|\.\.?\/)([^"']+)["']/g;
    // require: const { X } = require('@/xxx')
    const requireRe = /require\s*\(\s*["'](@\/|\.\.?\/)([^"']+)["']\s*\)/g;

    for (const match of fileContent.matchAll(esImportRe)) {
      symbols.push(match[1] + match[2]);
    }
    for (const match of fileContent.matchAll(requireRe)) {
      symbols.push(match[1] + match[2]);
    }

    return [...new Set(symbols)];
  }

  /** 解析 import 路径为文件路径 */
  resolveImportPath(importPath: string, sourceFilePath: string): string | null {
    // 处理 @/ alias
    if (importPath.startsWith("@/")) {
      return importPath.replace("@/", "") + ".ts";
    }
    // 处理相对路径
    if (importPath.startsWith("./") || importPath.startsWith("../")) {
      const sourceDir = sourceFilePath.split("/").slice(0, -1).join("/");
      const parts = importPath.split("/");
      const resultParts = [...(sourceDir ? sourceDir.split("/") : []), ...parts];
      // 简化处理 ../
      const resolved: string[] = [];
      for (const part of resultParts) {
        if (part === "..") {
          resolved.pop();
        } else if (part !== ".") {
          resolved.push(part);
        }
      }
      const resolvedPath = resolved.join("/");
      // 如果路径没有扩展名，尝试 .ts/.tsx
      if (!/\.[a-z]+$/.test(resolvedPath)) {
        return resolvedPath + ".ts";
      }
      return resolvedPath;
    }
    return null;
  }

  /** 构建完整 Review 上下文 */
  async build(url: string): Promise<ReviewContext> {
    const context = await this.github.fetchReviewContext(url);

    // 填充 contentHash
    for (const file of context.files) {
      file.contentHash = this.hashContent(file.fullContent || file.diff);
    }

    // 提取内部 import 并获取关联文件
    const relatedFiles: Record<string, RelatedContext[]> = {};
    const allImports = new Set<string>();

    for (const file of context.files) {
      if (!file.fullContent) continue;

      const imports = this.extractInternalImports(file.fullContent);
      const resolved: RelatedContext[] = [];

      for (const imp of imports) {
        const resolvedPath = this.resolveImportPath(imp, file.path);
        if (!resolvedPath || allImports.has(resolvedPath)) continue;
        allImports.add(resolvedPath);

        // 从 GitHub 获取关联文件内容（限制数量）
        if (Object.keys(relatedFiles).flat().length >= 10) break;

        const content = await this.github.getFileContent(
          context.owner,
          context.repo,
          resolvedPath,
          context.branchTo
        );
        if (content) {
          resolved.push({ path: resolvedPath, content, symbols: [imp] });
        }
      }

      if (resolved.length > 0) {
        relatedFiles[file.path] = resolved;
      }
    }

    context.relatedFiles = relatedFiles;
    return context;
  }
}

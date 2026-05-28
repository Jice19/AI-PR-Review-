"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [prUrl, setPrUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isValidGithubPrUrl = (url: string) => {
    return /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/.test(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!prUrl.trim()) {
      setError("请输入 PR URL");
      return;
    }
    if (!isValidGithubPrUrl(prUrl.trim())) {
      setError("请输入有效的 GitHub PR URL");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prUrl: prUrl.trim() }),
      });
      if (!res.ok) throw new Error("创建分析失败");
      const { id } = await res.json();
      router.push(`/review/${id}`);
    } catch {
      setError("分析请求失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-2xl text-center">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">
          AI PR Review
        </h1>
        <p className="mb-8 text-lg text-muted-foreground">
          智能代码评审助手，提升 Pull Request Review 效率与质量
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type="url"
              value={prUrl}
              onChange={(e) => setPrUrl(e.target.value)}
              placeholder="https://github.com/owner/repo/pull/123"
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={loading}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                分析中...
              </>
            ) : (
              "开始分析"
            )}
          </button>
        </form>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-4 text-left">
            <h3 className="font-semibold">变更总结</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              自动生成 PR 变更摘要和影响范围分析
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4 text-left">
            <h3 className="font-semibold">风险识别</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              覆盖前后端和数据库的全面安全检查
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4 text-left">
            <h3 className="font-semibold">修复建议</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              高危问题附带可执行的代码修复方案
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

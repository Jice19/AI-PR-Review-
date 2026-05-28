"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const GITHUB_PR_URL_RE = /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/;

export function PRUrlForm() {
  const router = useRouter();
  const [prUrl, setPrUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!prUrl.trim()) {
      setError("请输入 PR URL");
      return;
    }
    if (!GITHUB_PR_URL_RE.test(prUrl.trim())) {
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
      {error && <p className="text-sm text-destructive">{error}</p>}
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
  );
}

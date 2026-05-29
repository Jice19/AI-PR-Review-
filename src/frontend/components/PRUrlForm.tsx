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
      <div className="relative group">
        {/* glow ring */}
        <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 opacity-0 blur transition-opacity duration-300 group-focus-within:opacity-40" />
        <div className="relative flex items-center rounded-xl border border-border bg-card transition-colors duration-300 group-focus-within:border-indigo-500/50">
          <svg className="ml-4 h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="url"
            value={prUrl}
            onChange={(e) => setPrUrl(e.target.value)}
            placeholder="https://github.com/owner/repo/pull/123"
            className="w-full bg-transparent px-3 py-3.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none"
            disabled={loading}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive animate-fade-in">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-8 py-3 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
      >
        {/* shimmer overlay */}
        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:translate-x-full transition-transform duration-700" />
        {loading ? (
          <>
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            分析中...
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            开始分析
          </>
        )}
      </button>
    </form>
  );
}

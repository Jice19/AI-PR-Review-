"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

export default function LoginPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  const callbackUrl = searchParams.get("callbackUrl") || "/";

  // 已登录则直接跳转
  useEffect(() => {
    if (session) {
      router.replace(callbackUrl);
    }
  }, [session, router, callbackUrl]);

  const handleLogin = () => {
    setLoading(true);
    signIn("github", { callbackUrl });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm animate-scale-in">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/25">
            <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">AI PR Review</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">请登录以继续</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border/50 bg-card p-6">
          <button
            onClick={handleLogin}
            disabled={loading}
            className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl border border-border bg-secondary px-6 py-3.5 text-sm font-medium transition-all duration-300 hover:border-indigo-500/30 hover:bg-secondary/80 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            {loading ? "登录中..." : "使用 GitHub 登录"}
          </button>
        </div>
      </div>
    </div>
  );
}

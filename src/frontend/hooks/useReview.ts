"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ReviewReport } from "@/backend/types";

export function useReview(reviewId: string | undefined) {
  const router = useRouter();
  const [review, setReview] = useState<ReviewReport | null>(null);
  const [error, setError] = useState("");
  const [polling, setPolling] = useState(true);

  const fetchReview = useCallback(async () => {
    if (!reviewId) return;
    try {
      const res = await fetch(`/api/review/${reviewId}`);
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        throw new Error("获取失败");
      }
      const data = await res.json();
      setReview(data);
      if (data.status === "COMPLETED" || data.status === "FAILED") {
        setPolling(false);
      }
    } catch {
      setError("加载失败");
    }
  }, [reviewId, router]);

  useEffect(() => {
    if (!reviewId) return;
    fetchReview();
    const interval = setInterval(() => {
      setPolling((prev) => {
        if (prev) fetchReview();
        return prev;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [reviewId, fetchReview]);

  return { review, error, polling };
}

interface ProgressData {
  analyzed: number;
  totalFiles: number;
  totalIssues: number;
  suggestionCurrent?: number;
  suggestionTotal?: number;
}

interface CompleteData {
  overallScore: number;
  decision: string;
  totalIssues: number;
}

export function useReviewStream(reviewId: string | undefined) {
  const [streamText, setStreamText] = useState("");
  const [streamPhase, setStreamPhase] = useState("");
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [complete, setComplete] = useState<CompleteData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const completeRef = useRef(false);

  useEffect(() => {
    if (!reviewId) return;
    if (completeRef.current) return;

    const controller = new AbortController();

    fetch(`/api/review/${reviewId}/stream`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok || !res.body) return;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        let currentEvent = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const data = line.slice(6);
              try {
                const parsed = JSON.parse(data);
                switch (currentEvent) {
                  case "phase":
                    setStreamPhase(parsed.label || parsed.phase);
                    break;
                  case "token":
                    setStreamText((prev) => prev + parsed.content);
                    break;
                  case "progress":
                    setProgress(parsed);
                    break;
                  case "complete":
                    setComplete(parsed);
                    completeRef.current = true;
                    break;
                  case "error":
                    setErrorMsg(parsed.error || "分析失败");
                    completeRef.current = true;
                    break;
                }
              } catch {
                // ignore parse errors for partial chunks
              }
            }
          }
        }
      })
      .catch(() => {
        // SSE connection failed - silently degrade to polling-only
      });

    return () => controller.abort();
  }, [reviewId]);

  return { streamText, streamPhase, progress, complete, errorMsg };
}

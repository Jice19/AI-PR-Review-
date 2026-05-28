"use client";

import { useEffect, useState, useCallback } from "react";
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

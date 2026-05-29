"use client";

import { useParams, useRouter } from "next/navigation";
import { useReview, useReviewStream } from "@/frontend/hooks";
import { ReviewReport, LoadingSpinner } from "@/frontend/components";

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { review, error } = useReview(id);
  const { streamText, streamPhase, progress } = useReviewStream(id);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!review) return <LoadingSpinner text="加载中..." />;

  return (
    <ReviewReport
      review={review}
      onBack={() => router.push("/")}
      streamText={streamText}
      streamPhase={streamPhase}
      progress={progress}
    />
  );
}

-- Create FeedbackType enum
CREATE TYPE "FeedbackType" AS ENUM ('USEFUL', 'FALSE_POSITIVE', 'NEEDS_REVIEW');

-- Drop old Feedback table
DROP TABLE IF EXISTS "Feedback";

-- Create IssueFeedback table
CREATE TABLE "IssueFeedback" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "feedback" "FeedbackType" NOT NULL,
    "comment" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IssueFeedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IssueFeedback_issueId_key" UNIQUE ("issueId"),
    CONSTRAINT "IssueFeedback_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "ReviewIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create AuditLog table
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "promptChars" INTEGER NOT NULL,
    "responseChars" INTEGER NOT NULL,
    "totalTokens" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "fileCount" INTEGER,
    "success" BOOLEAN NOT NULL,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AuditLog_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create indexes for AuditLog
CREATE INDEX "AuditLog_reviewId_idx" ON "AuditLog"("reviewId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_model_idx" ON "AuditLog"("model");

-- Create index for IssueFeedback
CREATE INDEX "IssueFeedback_issueId_idx" ON "IssueFeedback"("issueId");

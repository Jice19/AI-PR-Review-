-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create FeedbackVector table
CREATE TABLE "FeedbackVector" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "feedback" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "codeSnippet" TEXT NOT NULL,
    "embedding" vector(1024) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackVector_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FeedbackVector_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "ReviewIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Unique + indexes
CREATE UNIQUE INDEX "FeedbackVector_issueId_key" ON "FeedbackVector"("issueId");
CREATE INDEX "FeedbackVector_issueId_idx" ON "FeedbackVector"("issueId");
CREATE INDEX "FeedbackVector_layer_idx" ON "FeedbackVector"("layer");

-- IVFFlat index for cosine similarity search (build after enough data)
-- CREATE INDEX "FeedbackVector_embedding_idx" ON "FeedbackVector" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

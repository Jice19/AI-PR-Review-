## 1. Backend: LLM Streaming Support

- [x] 1.1 Extract `parseLLMResponse<T>(rawContent: string): T` helper from `callLLM` in `src/backend/lib/llm.ts`
- [x] 1.2 Add `callLLMStream<T>(messages, options, onToken: (delta: string) => void): Promise<T>` to `src/backend/lib/llm.ts`
- [x] 1.3 Verify existing `callLLM` still works with extracted `parseLLMResponse`

## 2. Backend: Streaming Analyzer

- [x] 2.1 Add `analyzeSummaryStream(context, onToken): Promise<SummaryOutput>` in `src/backend/services/analyzer.ts`

## 3. Backend: SSE Endpoint

- [x] 3.1 Create `src/app/api/review/[id]/stream/route.ts` with `GET` handler that registers stream in `globalThis.__reviewStreams`
- [x] 3.2 Cleanup controller on `cancel()` callback

## 4. Backend: Review Service SSE Integration

- [x] 4.1 Add `emitSSE(reviewId, type, data)` helper in `src/backend/services/review.ts`
- [x] 4.2 Modify `analyzePRInBackground` Stage 1 to use `analyzeSummaryStream` and emit `token` events
- [x] 4.3 Emit `phase` events for FETCHING and ANALYZING transitions
- [x] 4.4 Emit `complete` event after all stages finish with `overallScore`, `decision`, `totalIssues`
- [x] 4.5 Update `saveIssues` to accept and persist optional `suggestion` field

## 5. Frontend: SSE Consumer Hook

- [x] 5.1 Add `useReviewStream(reviewId)` hook in `src/frontend/hooks/useReview.ts` using `fetch` + `ReadableStream.getReader`
- [x] 5.2 Parse SSE format (`event:` / `data:` lines) and expose `streamText`, `streamPhase`, `complete` state

## 6. Frontend: ReviewReport Streaming + Severity Grouping

- [x] 6.1 Replace blank spinner during analysis with streaming text panel that renders `streamText` in real time
- [x] 6.2 After completion, group issues by severity: CRITICAL → HIGH → MEDIUM → LOW
- [x] 6.3 Add visual distinction per severity group (colored borders, badges, issue count)

## 7. Frontend: IssueCard Fix Suggestion

- [x] 7.1 Add collapsible "修复建议" section to `IssueCard.tsx`, visible only when `issue.suggestion` exists
- [x] 7.2 Display `codeBefore` (red-tinted) and `codeAfter` (green-tinted) side-by-side
- [x] 7.3 Display `securityRationale` below code comparison when present

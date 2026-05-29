## ADDED Requirements

### Requirement: SSE stream endpoint
The system SHALL provide an SSE endpoint at `GET /api/review/[id]/stream` that creates a `ReadableStream` and registers its controller in `globalThis.__reviewStreams` keyed by review ID.

#### Scenario: Client connects to SSE stream
- **WHEN** an authenticated client sends GET request to `/api/review/{id}/stream`
- **THEN** the response has `Content-Type: text/event-stream` header
- **AND** the stream controller is registered in `globalThis.__reviewStreams[{id}]`

#### Scenario: Client disconnects
- **WHEN** the SSE stream is cancelled (client disconnects)
- **THEN** the controller is removed from `globalThis.__reviewStreams`

### Requirement: Phase events
The backend SHALL emit `phase` SSE events when the analysis transitions between stages (FETCHING → ANALYZING).

#### Scenario: Analysis starts fetching
- **WHEN** `analyzePRInBackground` begins fetching PR context
- **THEN** a `phase` event is emitted with `{"phase":"FETCHING","label":"获取代码上下文..."}`

#### Scenario: Analysis starts AI processing
- **WHEN** `analyzePRInBackground` begins AI analysis
- **THEN** a `phase` event is emitted with `{"phase":"ANALYZING","label":"AI 分析中..."}`

### Requirement: Token-level streaming for summary
During Stage 1 (summary generation), the backend SHALL use `callLLMStream` to push each token delta as an SSE `token` event to the connected stream.

#### Scenario: Summary token is generated
- **WHEN** the LLM generates a content delta during summary analysis
- **THEN** a `token` event is emitted with `{"content":"<delta>"}`

#### Scenario: Summary streaming completes
- **WHEN** the summary LLM call finishes
- **THEN** all accumulated tokens form the complete summary text

### Requirement: Complete event
When all three analysis stages finish, the backend SHALL emit a `complete` SSE event with the final score, decision, and issue count.

#### Scenario: Analysis finishes successfully
- **WHEN** `analyzePRInBackground` completes all stages
- **THEN** a `complete` event is emitted with `{"overallScore":<number>,"decision":"<APPROVE|COMMENT|REQUEST_CHANGES>","totalIssues":<number>}`

### Requirement: Fallback for missing stream
If no SSE stream is connected for a review ID, the backend SHALL silently skip emitting SSE events without throwing errors.

#### Scenario: No client connected
- **WHEN** `emitSSE` is called but `globalThis.__reviewStreams[reviewId]` is undefined
- **THEN** the emit call returns without error

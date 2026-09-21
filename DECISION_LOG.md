# 📜 Decision Log — Skylark Drones monday.com BI Agent

> **Deployed:** [https://skylark-monday-bi-agent-blush.vercel.app](https://skylark-monday-bi-agent-blush.vercel.app/) | **Repo:** [https://github.com/Avila-Princy-M01/skylark-monday-bi-agent](https://github.com/Avila-Princy-M01/skylark-monday-bi-agent)

## Key assumptions

- **As-of date anchored to the dataset, not the wall clock.** The data extends into 2026, so resolving "this quarter" against the real clock returns empty results for reviewers. All fiscal windows (April–March, matching the `SDPL/FY25-26/...` invoice convention) resolve against a configurable as-of date defaulting to `2026-03-31`, and the resolved window is disclosed in every answer.
- **No dataset values are committed.** All rows are read live from monday.com (GraphQL default, MCP switchable via `MONDAY_DATA_SOURCE`). Columns are mapped **by title at runtime**, never by hardcoded IDs, so the boards can be re-created without code changes.
- **Company-level joins are refused.** `COMPANY089` (Deals) and `WOCOMPANY_002` (Work Orders) have no valid cross-mapping. Cross-board analysis joins only on trustworthy keys — Owner code ↔ BD/KAM code and Sector — and every affected answer discloses that limitation.
- **Chat context is session-scoped.** The client sends prior turns with each question so follow-ups ("and for mining?", a clarifier-chip answer) resolve against the original intent; no chat history is persistently stored, which is not required by the brief and avoids a privacy burden.

## Trade-offs and rationale

- **LLM chooses _what_ to compute; TypeScript decides _what a number is_.** Every figure comes from pure deterministic tools (`lib/metrics/*.ts`) that return numbers together with rows scanned, assumptions and source row IDs. A numeric grounding guard rejects any prose figure absent from the computed fact sheet and falls back to a table renderer. Verified by 1,000-run zero-variance tests. Cost: the guard can occasionally reject truthful prose — a safe-direction failure; the user sees the computed table, never an invented number.
- **Six specialist agents over one monolithic prompt.** Supervisor → Data Steward → Clarifier → Planner → Analyst → Narrator, with a Critic that can send work **back to the Analyst for recomputation** (max 2 revisions, wall-clocked). Cost: more moving parts; benefit: the trace shows real delegation, self-correction and send-backs, and each role is testable in isolation.
- **Hand-rolled OpenAI-compatible client over LangGraph.js / the Vercel AI SDK.** LangGraph assumes durable checkpointers and long-running processes, which fight Vercel's ephemeral functions; the AI SDK became dead weight once the LLM surface reduced to structured plan-JSON and prose-over-computed-numbers. One small client covers the Gemini → GLM → Groq → OpenRouter failover chain; providers without keys are simply absent. Cost: no framework conveniences; benefit: zero lock-in, trivially hermetic tests.
- **GraphQL primary, MCP implemented but not default.** MCP is LLM-oriented and adds serialization overhead to bulk reads. Both transports live behind one `MondayDataSource` interface.
- **In-memory TTL cache with disk snapshot persistence.** Cold starts no longer lose the snapshot; `trySaveSnapshotToDisk` and `tryLoadSnapshotFromDisk` keep durable snapshots across serverless invocations, and `/api/health?probe=1` primes the cache so `hasSnapshot` is verified.
- **Loud schema validation over silent zero defaults.** `findMissingRequiredColumns` validates discovered board columns against required financial fields (`dealValue`, `orderValueExclGst`, `billedAmountExclGst`, `collectedAmountInclGst`, etc.). Missing columns loudly raise `missing_column_in_schema` `DataQualityIssue` records rather than quietly returning ₹0.
- **Dual-mode sliding-window rate limiting (Upstash Redis + In-Memory fallback).** Serverless environments have isolated memories across lambdas. We implemented atomic sliding-window rate limiting using Upstash Redis REST pipeline (`INCR` + `EXPIRE` + `TTL`) when credentials are provided, with an automatic fallback to an in-memory sliding-window log for local dev and hermetic tests. Route-specific limits guard expensive multi-agent LLM invocations (`/api/chat`: 10/min, `/api/brief`: 5/min, `/api/resync`: 2/2min) without blocking legitimate executive exploration.
- **Enterprise In-App Security & CSRF defense.** Enforced 16 KB strict request payload caps (`isPayloadTooLarge`), anti-spoofing client IP resolution prioritizing Cloudflare headers and sanitized proxy hops (`getClientIp`), origin verification against CSRF attacks on mutation endpoints (`/api/resync`), and distributed auto-expiring resync mutexes (`acquireDistributedResyncLock`) to prevent stampeding board synchronizations.
- **Conversational Intent Short-Circuit.** Greetings ("hi", "hello"), pleasantries, and capability inquiries ("what can you do?") are recognized immediately by `isConversationalQuery` and answered cleanly without executing costly Data Steward, Planner, Analyst, and Critic cycles, while still emitting supervisor trace events to preserve telemetry transparency.
- **Dynamic Structured Entity Facts over hardcoded indexes.** All sector scorecards, owner metrics, and entity breakdowns map dynamically through structured entity facts, avoiding rigid array indexes and preventing hallucination during cross-board joins.
- **Tactical Telemetry & Double-Bezel UI architecture.** Synthesizes modern tactical UI design: OLED depth (`#07070a`), double-bezel nested shells (`bezel-shell` / `bezel-inner`), asymmetrical bento grid for telemetry targets, island buttons with trailing icons, and role-specific glow badges for the multi-agent execution stream.
- **Keyword fallback routers with whole-word matching.** The deterministic planner/router only run when no LLM provider is configured or fails; a substring-matching bug ("softw**ar**e attach rate" routing to AR) found by tests is why matching is whole-word now.

## Interpretation of "leadership updates"

Built as a one-click **Exec Brief** (`/brief`): headline KPIs, pipeline health, revenue and collections position, operational risks, an AR watchlist, data-quality disclosures, and three suggested actions — rendered deterministically from the same metric toolbelt, passed through the grounding guard, exportable via copy / `.md` download / print-to-PDF. Because no historical snapshots are stored, week-over-week movement **cannot** be computed and is explicitly not estimated; the brief states this rather than fabricating a trend.

## What we would do differently with more time

1. **Durable snapshot historian** — persist daily snapshots so trends become real and cold starts degrade to stale-but-useful.
2. **Native tool-calling loop** for the Analyst instead of plan-JSON, for richer multi-step reasoning under the same determinism contract.
3. **Webhook-driven incremental sync** instead of TTL polling.
4. **Scheduled live-board integration test** separate from hermetic CI.
5. **Golden transcripts** captured from the deployed URL as living documentation.
6. **Voice agent interface** — a speech-in / speech-out layer (e.g. Gemini Live or ElevenLabs + Whisper) on top of the same multi-agent pipeline, so a founder can ask "What's our pipeline?" hands-free from a phone. The deterministic math core stays identical; only the I/O channel changes. This was the next item on the roadmap and would have been straightforward to wire given the SSE-streaming architecture already in place.

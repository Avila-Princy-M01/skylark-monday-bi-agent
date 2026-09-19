# 🦅 Skylark Drones: monday.com Business Intelligence Agent

A hosted multi-agent conversational system that answers founder-level business questions by reading two live monday.com boards (**Deals**, **Work Orders**), normalizing real-world-messy data, computing every figure deterministically in pure TypeScript, and narrating results with explicit assumptions and data-quality caveats.

| Submission link       | URL                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 🌐 Hosted application | [https://skylark-monday-bi-agent-blush.vercel.app](https://skylark-monday-bi-agent-blush.vercel.app/)                      |
| 📦 Source repository  | [https://github.com/Avila-Princy-M01/skylark-monday-bi-agent](https://github.com/Avila-Princy-M01/skylark-monday-bi-agent) |
| 📜 Decision log       | [`DECISION_LOG.md`](./DECISION_LOG.md)                                                                                     |

> **No dataset values are committed to this repository.** All data is read live from monday.com at runtime via the GraphQL API (or MCP), and the spreadsheets are git-ignored.

---

## ⚡ Core Principles

1. **Non-negotiable determinism rule** — LLMs decide _what_ to compute and _how to explain it_, but **never** perform arithmetic. Every figure comes from pure TypeScript in `lib/metrics/*.ts`, exposed as Zod-typed tools that return numbers together with rows scanned, assumptions applied, caveats triggered and the source row IDs behind the result.
2. **Numeric grounding guard** — every prose output is validated by `lib/narrate/numeric-guard.ts` against the verified fact sheets. Any figure the guard cannot trace triggers a fallback to a deterministic table renderer. The guard fails safe: it may reject a truthful sentence, it never accepts an invented number.
3. **Single normalization layer** — `lib/data/normalize.ts` repairs the real-world mess in one auditable pass (details below) and emits a `DataQualityReport` itemizing every correction.
4. **Genuine multi-agent system** — a Supervisor delegates to five specialists through real LLM planning with a deterministic fallback; a Critic can send work **back to the Analyst for recomputation** (bounded to 2 revision passes and a wall-clock budget).
5. **Indian fiscal year** — April–March boundaries matching the `SDPL/FY25-26/...` invoice convention; the as-of date is anchored to the dataset (default `2026-03-31`) so time-based questions behave identically for every reviewer.
6. **Graceful degradation ladder** — fresh cache → live read → best-effort instance-local snapshot with its age stated → explicit "unavailable" warning. It never looks like a successful empty result.

---

## 🏗️ Architecture & Data Flow

```
User query ──► POST /api/chat (SSE stream)
                   │
                   ▼
           [Supervisor] ──────────── owns budgets, streams every step to the UI
                   │
                   ├─► [Data Steward]  freshness, schema and data-quality audit
                   ├─► [Clarifier]     ambiguity verdict → quick-reply chips or stated assumptions
                   ├─► [Planner]       LLM selects which deterministic tools to run (Zod-validated;
                   │                   unknown tool ⇒ deterministic router). NEVER produces a number.
                   ├─► [Analyst]       executes the metric toolbelt, inspects outputs,
                   │                   self-corrects on empty filters (alias retry, wider window)
                   ├─► [Narrator]      founder-grade prose strictly from the verified fact sheet
                   └─► [Critic]        verifies grounding + completeness;
                                       may send the Analyst BACK for recompute (max 2 passes)
                                       before the final write-up is served
```

The chat route streams **Server-Sent Events** (`data-source` → `trace`… → `final`), so the reviewer watches delegation, tool inputs/outputs, self-corrections and the Critic's send-backs happen live in the activity panel — not as one blob at the end.

### Deterministic metric toolbelt (`lib/metrics/*.ts`)

| Tool                         | Answers                                                                                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_pipeline_health`        | open pipeline value, probability-weighted pipeline (H=0.7 / M=0.4 / L=0.15, disclosed), counts, mean/median deal size, sector/owner/stage breakdowns                                                  |
| `get_stalled_deals`          | open deals whose tentative close date is past the as-of date                                                                                                                                          |
| `get_revenue_metrics`        | contracted (excl. GST) vs billed (excl. GST) vs collected (incl. GST) — never conflated                                                                                                               |
| `get_collections_and_ar`     | collection efficiency %, outstanding AR, AR-priority accounts, over-billed negatives                                                                                                                  |
| `get_operational_metrics`    | execution status mix, not-started work orders with past PO dates, delivery-before-PO anomalies, software attach rate (Spectra/DMO/Dock)                                                               |
| `get_cross_board_scorecards` | owner and sector scorecards joining both boards on **Owner code ↔ BD/KAM code** and **Sector** — company-level joins are explicitly forbidden (`COMPANY089` vs `WOCOMPANY_002` have no valid mapping) |
| `get_concentration_risk`     | top-N client and owner share of pipeline and order book                                                                                                                                               |
| `get_stuck_money_analysis`   | the won → unbilled → billed-but-uncollected conversion chain                                                                                                                                          |

### Data transport

- **GraphQL (default)** — monday.com API v2: runtime schema discovery mapping columns **by title, never hardcoded IDs**; full cursor pagination (`items_page`, limit 100); pinned `API-Version` header; typed error kinds (unauthorized, rate-limited with `Retry-After`, daily-limit, complexity-budget, board-not-found, network, malformed-response) with exponential backoff + jitter.
- **MCP (optional)** — set `MONDAY_DATA_SOURCE=mcp` to switch to the monday MCP server behind the same `MondayDataSource` interface. Both transports are implemented and tested.

### Data normalization (the messy-data layer)

The real sheets contain, and the layer repairs: embedded junk header rows ("Nezuko", "Bugs Bunny"); a **blank first row in the Work Orders sheet** (removed before import); the 100%-empty `Close Date (A)` column (excluded from all logic and reported); masked placeholder amounts ≈ ₹1 (classified as undisclosed, **excluded from every sum**, counted separately); date coercion across ISO / DD-MM-YYYY / Excel serials / month-name formats with impossible dates rejected and logical anomalies flagged (delivery before PO); free-text quantity parsing (`5360 HA`, `3956HA`, `2057 Acr`, `98000 Acres`, `40MW`, `24 Months`, `7 mines`, `NA`); "BIlled" → "Billed" canonicalization; negative amounts-to-be-billed flagged as **over-billed** rather than parse errors; status↔stage contradictions reconciled under a stated precedence rule (stage = funnel position, status = open/closed) with conflict counts surfaced; near-duplicates flagged, never silently dropped (e.g. COMPANY111 ×3 at identical value). Currency is INR throughout, formatted in ₹ lakh / crore.

---

## 🚀 Getting started

### 1. Prerequisites

- Node.js 20+, npm 10+
- A monday.com account with a personal API token (read access is sufficient)

### 2. monday.com board setup

Create two boards and import the two provided spreadsheets:

**Deals board** — import `Deal funnel Data.xlsx` with these column types:

| Column               | Type                                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| Deal Name            | item name                                                                |
| Owner code           | Text                                                                     |
| Client Code          | Text                                                                     |
| Deal Status          | Status                                                                   |
| Close Date (A)       | Date _(100% empty in the data — kept for fidelity, excluded from logic)_ |
| Closure Probability  | Status                                                                   |
| Masked Deal value    | Numbers                                                                  |
| Tentative Close Date | Date                                                                     |
| Deal Stage           | Status                                                                   |
| Product deal         | Text                                                                     |
| Sector/service       | Text                                                                     |
| Created Date         | Date                                                                     |

**Work Orders board** — import `Work_Order_Tracker Data.xlsx`.

> ⚠️ **The sheet has a blank first row — delete it before importing.** The real headers begin on row 2.

| Column                    | Type                                                          |
| ------------------------- | ------------------------------------------------------------- |
| Deal name masked          | item name                                                     |
| Customer Name Code        | Text                                                          |
| Serial #                  | Text                                                          |
| Nature of Work            | Long text                                                     |
| Last executed month       | Text                                                          |
| Execution Status          | Status                                                        |
| Data Delivery Date        | Date                                                          |
| Date of PO/LOI            | Date                                                          |
| Document Type             | Status                                                        |
| Probable Start Date       | Date                                                          |
| Probable End Date         | Date                                                          |
| BD/KAM Personnel code     | Text                                                          |
| Sector                    | Text                                                          |
| Type of Work              | Long text                                                     |
| Software platform field   | Status                                                        |
| Last invoice date         | Date                                                          |
| Latest invoice no.        | Text                                                          |
| Financial amount fields   | Numbers                                                       |
| Quantity fields           | **Text** (values carry units: `5360 HA`, `40MW`, `24 Months`) |
| Billing/collection fields | Status or text                                                |
| Collection Date           | Date                                                          |

Generate the token in monday.com under **Avatar → Administration → API → Personal API token**, and copy the two numeric board IDs from each board's URL.

### 3. Environment variables

Copy `.env.example` → `.env.local`. Every variable and its behaviour when absent:

| Variable                                                         | Required | Absent behaviour                                                                |
| ---------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| `MONDAY_API_TOKEN`                                               | ✅       | live reads refused with an explicit warning; cache/stale snapshots still served |
| `MONDAY_DEALS_BOARD_ID`                                          | ✅       | same as above (`DEALS_BOARD_ID` also accepted for backwards compatibility)      |
| `MONDAY_WORK_ORDERS_BOARD_ID`                                    | ✅       | same as above (`WORK_ORDERS_BOARD_ID` also accepted)                            |
| `MONDAY_API_VERSION`                                             | –        | defaults to `2024-10`                                                           |
| `MONDAY_DATA_SOURCE`                                             | –        | `graphql` (default) or `mcp`                                                    |
| `MONDAY_MCP_SERVER_URL`                                          | –        | defaults to `https://mcp.monday.com/mcp`                                        |     | `GEMINI_API_KEY` / `GLM_API_KEY` / `GROQ_API_KEY` / `OPENROUTER_API_KEY` | –   | the agent runs the **deterministic degraded path** (router + template narration) and the health endpoint reports `degraded`; the failover chain is Gemini → GLM → Groq → OpenRouter, first configured provider wins (with no Gemini key the chain effectively starts at GLM) |
| `GEMINI_MODEL` / `GLM_MODEL` / `GROQ_MODEL` / `OPENROUTER_MODEL` | –        | sensible per-provider defaults                                                  |
| `AS_OF_DATE`                                                     | –        | `auto` (default) anchors to the dataset end, `2026-03-31`                       |
| `CACHE_TTL_SECONDS`                                              | –        | defaults to `600`; invalid values fall back to it                               |
| `LLM_TIMEOUT_MS`                                                 | –        | per-provider call timeout, default `12000`                                      |
| `NEXT_PUBLIC_APP_NAME`                                           | –        | UI display name                                                                 |

Secrets never enter the repo: `.env.local` is git-ignored, CI runs gitleaks, and provider error strings never echo request bodies (which contain keys).

### 4. Install & run

```bash
npm ci
npm run dev
```

- `http://localhost:3000` — conversational agent with the live multi-agent trace panel
- `http://localhost:3000/brief` — one-click Executive Brief (copy / download `.md` / print-to-PDF)
- `http://localhost:3000/api/health` — configuration readiness; add `?probe=1` for a live monday.com connectivity check

### 5. Deploy to Vercel

1. Push the repo to GitHub and import it in Vercel (framework auto-detected).
2. Add the environment variables above in **Project → Settings → Environment Variables** (use the canonical `MONDAY_`-prefixed names).
3. Deploy — `vercel.json` pins `npm ci` for reproducible installs.
4. Verify: the deployment smoke test runs `npm run smoke:test` against the URL (homepage 200, `/api/health` valid JSON with a truthful status; `misconfigured` fails the deployment, `degraded` passes).

### 6. CI/CD

GitHub Actions (`.github/workflows/ci.yml`) gates every push and PR: secret scan (gitleaks, **advisory** — flagged via `continue-on-error`, not a blocking gate) → advisory `npm audit` → Prettier check → ESLint → `tsc --noEmit` → Vitest with coverage thresholds → production build. A separate workflow runs the deployment smoke test on `deployment_status`. Installs use `npm ci` with npm caching.

---

## 🧪 Testing & verification

```bash
npm run validate          # typecheck + lint + format:check + tests
npm run test:coverage     # 136 tests, thresholds: 75% lines/functions/statements, 60% branches
npm run build             # production build
npm run smoke:test        # deployment smoke test (set SMOKE_TEST_URL)
```

**Current state: 136 tests across 16 suites, all green.** Highlights:

- `determinism.test.ts` — 1,000 repeated runs of the metric core produce **identical golden numbers (zero variance)**.
- `normalizer.test.ts` — every repair rule reproduces a real defect found in the supplied data.
- `metrics.test.ts` / `golden-answers.test.ts` — fixed tool inputs always yield identical outputs.
- `agent-behaviour.test.ts` — supervisor delegation, Analyst self-correction on empty filters, Critic send-back loops terminate within budget.
- `graphql-transport.test.ts` / `factory-and-router.test.ts` / `resilience.test.ts` — transport error mapping, GraphQL/MCP switching, the degradation ladder, LLM provider failover, and the degraded router's grounding. All tests are hermetic: fetch and data sources are injected, nothing touches the network.

_Known slowness:_ the transport tests exercise the real exponential-backoff ladder (~15–20s per failed-call test), which is why the suite takes ~20s in total.

---

## 💬 Example transcripts

**1. Messy-data caveat**

> **User:** "What is our open pipeline and where is money stuck?"
>
> **Data Steward:** audited 48 deals / 52 work orders; dropped 2 junk header rows; excluded 1 masked ≈₹1 deal from all sums.
> **Analyst:** `get_pipeline_health` → `get_stalled_deals` → `get_stuck_money_analysis`.
> **Answer:** open pipeline **₹X** (weighted **₹Y**)… _caveat chips: "1 undisclosed-value deal excluded", "Won deals are not linked one-to-one to work orders — cross-board figures join on owner + sector only"._
> **"Show the data"** expander reveals the underlying source rows.

**2. Clarifying question** — "What's our revenue?" is ambiguous between contracted / billed / collected; the Clarifier returns one-click chips for each basis (or proceeds under a stated, overridable assumption).

**3. Critic send-back** — on "what is our contracted vs billed revenue", a first draft covering only open pipeline is **rejected**; the Critic requests `get_revenue_metrics`; the Analyst recomputes; the Narrator rewrites. The trace shows the full loop, and the answer reports `2 revision pass(es)`.

**4. Cross-board insight** — "How is the energy sector performing?" resolves **energy → Renewables + Powerline** (no literal energy sector exists) and joins both boards on owner code and sector, with the non-join caveat attached.

**5. monday.com failure** — invalidate the token: the Data Steward reports the live read failed, answers continue from the **last known-good snapshot** with its age stated, and a staleness banner appears in the UI. With no snapshot at all, the app says so explicitly instead of showing empty charts.

---

## 🤖 AI tools used

- **AI coding assistants** — architecture planning, implementation, test authoring, CI/CD wiring, debugging and documentation. All architectural decisions were reviewed and directed by the author; the deterministic-math rule means no LLM (including the coding assistant) ever decides a business figure.
- **Provider LLMs at runtime** (Gemini / GLM / Groq / OpenRouter via one OpenAI-compatible client) — strictly for intent→plan selection and prose generation over already-computed numbers, with a deterministic fallback when all providers fail.
- No AI tool generated dataset values; none were given the assignment data.

## 🧗 Challenges faced

1. **Messy data everywhere** — junk header rows, masked ≈₹1 values, mixed date formats and free-text quantities required a single auditable normalization layer rather than scattered fixes; the DataQualityReport now proves every repair.
2. **Unjoinable identifiers** — `COMPANYxxx` vs `WOCOMPANY_xxx` have no mapping; we refused to fake one and confined cross-board analysis to trustworthy keys, disclosing the limitation in every relevant answer.
3. **Time-based questions vs a 2026 dataset** — wall-clock anchoring returned empty windows; anchoring the as-of date to the dataset (configurable) made every reviewer's session deterministic.
4. **"Agent" that wasn't one** — the first runtime keyword-routed everything. We replaced it with LLM planning (Zod-validated, tool-enum-bounded), Critic-driven re-analysis, and kept the deterministic router strictly as a safety net.
5. **Testing a failure ladder** — graceful degradation is only believable if tested; injecting fetch/data-source seams let us prove stale-snapshot recovery, provider failover and misconfiguration failures without touching the network.
6. **The grounding guard vs truthful prose** — it initially rejected truthful answers because of ratio caveats ("not 1:1 linked") and the pipeline's own disclosed weights (0.7/0.4/0.15). Both are now handled; the guard still fails safe.

## ⚖️ Assumptions & trade-offs

- **Determinism over flexibility**: every metric is a TypeScript tool; richer ad-hoc analysis would require expanding the toolbelt, not trusting a model's arithmetic.
- **In-memory & instance-local snapshot cache**: `os.tmpdir()` serves as a best-effort instance-local snapshot; on serverless platforms (Vercel/AWS Lambda), cold starts or instance recycles reset this snapshot, requiring a live read or configured external store.
- **No historical snapshots**: week-over-week trends cannot be computed and are deliberately not estimated — the Exec Brief states this.
- **Masked ≈₹1 values are excluded from all sums** and reported as undisclosed rather than approximated.
- **Session-scoped chat**: the client sends prior turns with each question so follow-ups and clarifier-chip answers resolve against the original intent; no persistent chat-log storage (not required by the brief, avoids privacy burden).

## 🧭 Known limitations

- Multi-region persistent snapshot storage is not wired by default; fallback snapshots are best-effort instance-local (`os.tmpdir()`) across warm lambda invocations.
- The Critic's re-analysis is bounded to 2 passes; on non-convergence the answer is served with its caveats and `criticRejectedFinal` flagged.
- Transport tests are slow (~15–20s each) because they exercise the real backoff ladder.

## 🗺️ Status — completed vs remaining

**Completed:** live monday.com GraphQL + MCP transports with runtime schema discovery and cursor pagination; single normalization layer with a full data-quality report; 8 deterministic metric tools; multi-agent loop (Supervisor / Data Steward / Clarifier / Planner / Analyst / Narrator / Critic) with LLM planning and deterministic fallback; numeric grounding guard; SSE-streamed trace panel; staleness banners and data-health modal; Exec Brief with copy/download/print; 136 hermetic tests across 16 suites with coverage gates; CI/CD with secret scanning and a deployment smoke test; Vercel deployment; README and DECISION_LOG.

**Remaining (with more time):** durable snapshot store; voice agent interface; richer Analyst tool-calling loop; scheduled live-board integration test; golden transcripts from the deployed URL.

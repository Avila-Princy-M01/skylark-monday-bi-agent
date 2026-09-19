# 🦅 Skylark Drones: monday.com Business Intelligence Agent

A hosted multi-agent conversational system that answers founder-level business questions by reading two live monday.com boards (Deals, Work Orders), normalizing real-world-messy data, computing every figure deterministically in pure TypeScript, and narrating results with explicit assumptions and data-quality caveats.

---

## ⚡ Key Highlights & Core Principles

1. **Non-Negotiable Determinism Rule**: LLMs decide _what_ to compute and _how to explain it_, but **never** perform arithmetic or aggregations. 100% of numbers are computed by pure TypeScript functions in `lib/metrics/*.ts`.
2. **Numeric Grounding Guard**: Every prose output is validated by `lib/narrate/numeric-guard.ts` against verified fact sheets. Ungrounded figures trigger an automatic fallback to deterministic tables.
3. **Single Normalization Layer**: `lib/data/normalize.ts` handles junk header drops (`Nezuko`, `Bugs Bunny`), masked ~₹1 placeholder detection, 100% empty column exclusion (`Close Date A`), date coercion, free-text unit parsing, and duplicate hashing.
4. **Multi-Agent Specialist Mesh**: Coordinated by a Supervisor across 5 specialized roles (Data Steward, Clarifier, Analyst, Critic/Verifier, Narrator) with strict loop budgets and degraded-mode fallback.
5. **Indian Fiscal Year Alignment**: April 1 to March 31 fiscal boundaries matching `SDPL/FY25-26/...` invoice conventions.

---

## 🛠️ Architecture & Data Flow

```
User Query ──► [Supervisor Agent]
                    │
                    ├──► [Data Steward] ────► Audit Monday cache, freshness & normalization repairs
                    ├──► [Clarifier]    ────► Ambiguity check & quick-reply chips
                    ├──► [Analyst]      ────► Autonomous execution over Deterministic Metric Toolbelt
                    │                         (Pipeline, Stalled, Revenue, Collections, Attach Rate)
                    ├──► [Narrator]     ────► Grounded prose synthesis
                    └──► [Critic]       ────► Evaluator-optimizer verification (Numeric Grounding check)
```

---

## 📋 Deterministic Metric Toolbelt (`lib/metrics/*.ts`)

- **Pipeline Health (`pipeline.ts`)**: Total open value, weighted pipeline ($H=0.7, M=0.4, L=0.15$), mean/median deal size, and sector/owner breakdowns.
- **Stalled Pipeline (`pipeline.ts`)**: Open deals with tentative close dates past the as-of date.
- **Revenue Metrics (`revenue.ts`)**: Pre-tax contracted order value vs recognized billed revenue vs cash collected.
- **Collections & AR (`collections.ts`)**: Overall & sector collection efficiency %, outstanding AR, and top AR-risk accounts.
- **Operational Metrics (`operations.ts`)**: Execution status mix, unstarted PO anomalies, and software attach rate (Spectra/DMO/Dock vs pure service).
- **Cross-Board Scorecards (`cross-board.ts`)**: Joins on trustworthy keys (`Owner Code` $\leftrightarrow$ `BD/KAM Code`, `Sector`). Company-level joins strictly forbidden.
- **Concentration Risk (`concentration.ts`)**: Top-N client & owner pipeline and order book share percentages.
- **Stuck Money Breakdown (`stuck-money.ts`)**: Won deals $\rightarrow$ billed revenue $\rightarrow$ uncollected AR conversion chain.

---

## 🚀 Getting Started

### 1. Prerequisites

- Node.js 20+
- npm 10+

### 2. Environment Variables (`.env.local`)

Create a `.env.local` file based on `.env.example`:

```bash
# Monday.com API Configuration
MONDAY_API_TOKEN=your_monday_api_personal_token
MONDAY_DEALS_BOARD_ID=your_deals_board_id
MONDAY_WORK_ORDERS_BOARD_ID=your_work_orders_board_id

# LLM Provider Keys (Provider failover chain: Gemini -> GLM -> Groq -> OpenRouter)
GEMINI_API_KEY=your_gemini_api_key
GLM_API_KEY=your_zhipu_glm_key
GROQ_API_KEY=your_groq_key
OPENROUTER_API_KEY=your_openrouter_key
```

### 3. Install & Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000` to interact with the BI agent or `http://localhost:3000/brief` to generate an Executive Leadership Brief.

---

## 🧪 Testing & Verification

Run the full test suite (35+ tests across 7 suites):

```bash
npm run validate
```

This runs:

1. `npm run typecheck` — Strict TypeScript checking (`tsc --noEmit`)
2. `npm run lint` — ESLint 9 rules
3. `npm run format:check` — Prettier code style check
4. `npm run test` — Vitest unit and behavioral test suites

---

## 💬 Example Transcript

**User**: _"What is our open pipeline and where is money stuck?"_

**Supervisor & Multi-Agent Loop**:

1. `Data Steward`: Audited 48 deals and 52 work orders. Excluded 2 junk header rows (`Nezuko`, `Bugs Bunny`) and 1 masked ~₹1 placeholder.
2. `Clarifier`: Disclosed standard Indian Fiscal Year (FY25-26) assumption.
3. `Analyst`: Executed `get_pipeline_health`, `get_stalled_deals`, and `get_stuck_money_analysis`.
4. `Critic`: Checked 100% numeric grounding on generated fact sheet.
5. `Narrator`: Generated executive markdown summary with underlying source record drawer.

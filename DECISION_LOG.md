# 📜 Architecture Decision Log — Skylark BI Agent

This document records the principal architectural decisions, technical trade-offs, and design rationale behind the Skylark Drones monday.com Business Intelligence Agent.

---

## 1. Deterministic Math Core vs. LLM-Based Arithmetic

### Context

Large Language Models exhibit non-deterministic behavior and are prone to hallucinations when computing aggregations, floating-point sums, percentage ratios, and filtering over multi-thousand-row datasets.

### Decision

**Non-Negotiable Determinism Rule**: LLMs choose _what_ to compute, in what sequence, and when to dig deeper, but _never_ decide what a number is.

- All arithmetic, aggregations, ratios, and rankings are calculated by pure TypeScript functions in `lib/metrics/*.ts`.
- The Narrator agent is constrained by `lib/narrate/numeric-guard.ts`, which rejects ungrounded figures and falls back to deterministic markdown tables.

### Outcome

Zero variance across runs, 100% auditable figures, with traceable source row IDs for every metric.

---

## 2. Multi-Agent Specialization vs. Monolithic Agent Loop

### Context

A single monolithic prompt handling schema mapping, error handling, math calculations, and prose synthesis easily exceeds context window limits and loses track of data-quality caveats.

### Decision

Decomposed into 6 distinct specialist roles orchestrated by a Supervisor:

1. **Data Steward**: Freshness audit, normalization repairs, and caveat surfacing.
2. **Clarifier**: Intent disambiguation and quick-reply chip generation.
3. **Analyst**: Autonomous tool execution and self-correction over zero-result filters.
4. **Critic / Verifier**: Evaluator-optimizer pass verifying numeric grounding (max 2 iterations).
5. **Narrator**: Founder-grade prose synthesis strictly from verified fact sheets.
6. **Supervisor**: Step budgeting, wall-clock timeout protection, and degraded router fallback.

---

## 3. Dynamic Schema Discovery vs. Hardcoded Column IDs

### Context

monday.com boards evolve over time: column IDs change or vary between accounts, but column titles remain human-readable.

### Decision

The GraphQL layer (`lib/monday/graphql-source.ts`) queries the board schema at runtime (`columns { id title type }`) and maps columns dynamically by title.

---

## 4. Single Normalization Layer vs. Ad-Hoc Data Cleaning

### Context

Real-world monday.com data contains embedded junk header rows (`Nezuko`, `Bugs Bunny`), 100% empty columns (`Close Date A`), masked placeholder values (~₹1), and over-billed negative quantities.

### Decision

`lib/data/normalize.ts` serves as the single source of truth for normalization, outputting clean `Deal[]` and `WorkOrder[]` alongside an auditable `DataQualityReport`.

---

## 5. Explicit Non-Join Rule on Company Namespaces

### Context

`COMPANY089` in Deals and `WOCOMPANY_002` in Work Orders inhabit separate identifier namespaces without a foreign key.

### Decision

Cross-board joins are strictly confined to trustworthy keys (`Owner Code` $\leftrightarrow$ `BD/KAM Personnel Code` and `Sector`). Company-level joins are explicitly disabled.

---

## 6. What Would Be Done Differently With More Time

1. **Incremental Snapshot Historian**: Persist daily snapshots in PostgreSQL to compute historical quarter-over-quarter velocity trends without violating grounding rules.
2. **Direct Monday Webhook Push**: Real-time push updates rather than TTL caching.
3. **Embedded WebGL Geospatial Viewer**: Interactive 3D drone survey flight boundary visualization alongside financial metrics.

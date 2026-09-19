# Skylark Drones: monday.com Business Intelligence Agent

A hosted multi-agent conversational system that answers founder-level business questions by reading two live monday.com boards (Deals, Work Orders), normalizing real-world-messy data, computing every figure deterministically in TypeScript, and narrating results with explicit assumptions and data-quality caveats.

## Tech Stack

- **Next.js 15 (App Router)** + TypeScript + Tailwind CSS
- **Vercel AI SDK** multi-agent orchestration
- **monday.com GraphQL API v2** dynamic schema integration
- **Deterministic Metric Engine**: 100% pure TypeScript calculation (No LLM math)
- **CI/CD Quality Pipeline**: GitHub Actions with Prettier, ESLint, TypeScript tsc check, Vitest coverage, npm security audit, and production build checks.

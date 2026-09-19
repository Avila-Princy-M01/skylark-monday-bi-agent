# Skylark Drones: monday.com Business Intelligence Agent

A hosted multi-agent conversational system that answers founder-level business questions by reading two live monday.com boards (Deals, Work Orders), normalizing real-world-messy data, computing every figure deterministically in TypeScript, and narrating results with explicit assumptions and data-quality caveats.

## Tech Stack

- **Next.js 15 (App Router)** + TypeScript + Tailwind CSS
- **Vercel AI SDK** multi-agent orchestration
- **monday.com GraphQL API v2** dynamic schema integration
- **Deterministic Metric Engine**: 100% pure TypeScript calculation (No LLM math)
- **CI/CD Quality Pipeline**: GitHub Actions with Prettier, ESLint, TypeScript tsc check, Vitest coverage, npm security audit, and production build checks using `npm ci`.

## Health & Readiness Architecture

### `/api/health` — Configuration Readiness Probe

The `/api/health` endpoint serves as a **lightweight deployment configuration readiness check** (HTTP 200/503).
It returns:

```json
{
  "status": "healthy",
  "checkType": "configuration_readiness",
  "scope": "lightweight_readiness_probe",
  "description": "Lightweight configuration readiness probe verifying environment variables, board mappings, and LLM key presence. Does not make live upstream network calls to Monday.com or LLM providers during basic probe.",
  "upstreamConnectivityVerified": false,
  "service": "skylark-monday-bi-agent",
  "timestamp": "2026-09-19T...",
  "uptimeSeconds": 120,
  "diagnostics": {
    "monday": {
      "configured": true,
      "dataSource": "graphql",
      "dealsBoardId": "configured",
      "workOrdersBoardId": "configured"
    },
    "llm": {
      "configured": true,
      "providers": {
        "gemini": true,
        "glm": false,
        "groq": false,
        "openrouter": false
      }
    },
    "cache": {
      "ttlSeconds": 300,
      "asOfDate": "auto"
    }
  }
}
```

> **Note on Scope**: This endpoint validates credential presence and format. It does not perform active network round-trips to Monday.com or LLM endpoints on every probe to avoid consuming rate limits or incurring function latency during deployment health checks. Live upstream connectivity is verified during runtime data synchronization.

## CI/CD & Reproducibility

- **Strict `npm ci` Enforcement**: All GitHub Actions workflows (`.github/workflows/ci.yml`, `.github/workflows/deploy-smoke-test.yml`) and `vercel.json` strictly execute `npm ci` against the frozen `package-lock.json`.
- **Parallel Matrix**:
  1. `🛡️ Secret Scan & Security Audit (Advisory)` (Gitleaks + npm audit)
  2. `🧹 Lint & Formatting Guard` (ESLint 9 + Prettier)
  3. `🔷 Strict Type Safety` (`tsc --noEmit`)
  4. `🧮 Deterministic Math & Coverage Bot` (Vitest coverage bot)
  5. `🚀 Production Build Gate` (`next build`)

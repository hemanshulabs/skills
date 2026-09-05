---
name: api-traffic
description: Profile and benchmark API endpoints using autocannon. Diagnoses slow routes, measures latency percentiles (p50/p95/p99), detects error spikes, and recommends fixes.
---

# Skill: API Traffic Analyzer

Profile and benchmark backend API endpoints using AutoCannon. Automatically discover project routes, test active endpoints with controlled concurrency, measure latency percentiles (p50, p95, p99), and detect performance regressions.

> **Prerequisites:**
> - Node.js 18+ installed on system
> - A running local backend server (e.g. `http://localhost:3000`, `3001`, `8000`, `8080`)
> - `autocannon` installed (`npm install -g autocannon` or in project devDependencies)

---

## When to Use

- The user says `/api-traffic`
- The user wants to benchmark or load-test local API routes
- The user wants to identify slow endpoints or latency bottlenecks
- The user asks whether any endpoints exceed their service latency budget (e.g. 200ms SLO)
- The user wants to detect endpoints suitable for caching (static GET responses)

---

## Important: Secret Redaction & Security

- **Strict Path Sanitization**: Discovered and analyzed routes are strictly validated and sanitized to prevent shell injection and path traversal.
- **Sandboxed Execution**: Benchmark commands run with `{ shell: false }` using direct argument arrays.
- **Zero Unprompted Installs**: No packages are installed automatically at runtime without explicit user consent.
- **Secret Redaction**: Always redact sensitive tokens and credentials before outputting benchmark results or captured headers:
  - Replace Authorization headers, session cookies, passwords, and API keys with `<REDACTED>`.

---

## Default Workflow

```bash
node skills/api-traffic/scripts/quick-scan.js
```

This will:
1. Verify `autocannon` presence on your environment (without unprompted remote package downloads)
2. Discover all API endpoints in the project across Express, Next.js, Fastify, NestJS, Hono, and Koa
3. Validate and strictly sanitize discovered route paths against command injection
4. Detect active local server port (pings 3000, 3001, 8000, 8080, 5000, 4000)
5. Run safe AutoCannon benchmarks (10 connections, 10 seconds per route) with `{ shell: false }`
6. Display a clean, token-efficient operational summary table with actionable fixes

---

## Script Options

| Flag | Default | Description |
|---|---|---|
| `--project` | `.` (current dir) | Project workspace path to discover API routes |
| `--base-url` | auto-detected | Target base URL of running backend server |
| `--connections` | `10` | Number of concurrent connections per benchmark |
| `--duration` | `10` | Duration in seconds to test each route |

---

## Examples

```bash
# Default quick scan (auto-detects project routes and local server port)
node skills/api-traffic/scripts/quick-scan.js

# Custom port target
node skills/api-traffic/scripts/quick-scan.js --base-url http://localhost:8080

# Stress test with higher concurrency and duration
node skills/api-traffic/scripts/quick-scan.js --connections 50 --duration 20

# Run in another project directory
node skills/api-traffic/scripts/quick-scan.js --project "../my-express-app"
```

---

## Expected Output Format

### Performance Summary Table

| Route | Method | RPS | p50 | p95 | p99 | Errors | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `/api/products` | `GET` | 2,410 | 2ms | 6ms | 11ms | 0 | ✅ Healthy |
| `/api/products/:id` | `GET` | 2,890 | 1ms | 4ms | 7ms | 0 | ✅ Healthy |
| `/api/config` | `GET` | 2,120 | 1ms | 5ms | 8ms | 0 | ✅ Healthy |
| `/api/search` | `POST` | 310 | 45ms | 110ms | 185ms | 0 | ✅ Healthy |
| `/api/checkout` | `POST` | 3 | 2.6s | 2.8s | 3.1s | 1 | 🔴 Slow |

### Bottlenecks & Fix Recommendations (Flagged Routes Only)

- **🔴 `POST /api/checkout`** — Latency p95: 2.8s exceeds 500ms SLO (+460%)
  - *Root Cause:* Synchronous blocking payment wait or unindexed database query.
  - *Fix:* Move order fulfillment to a background task queue or add an index on the orders table.
- **🟡 `GET /api/config`** — High response repetition detected.
  - *Fix:* Add HTTP `Cache-Control: public, max-age=60` headers to eliminate redundant database hits.

> **Token Limit**: Keep the final agent response strictly under 400 tokens. Lead with the table and skip explanations for healthy routes.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "API Server Not Reachable" | Start your local API development server (`npm run dev`) before running the scan. |
| "AutoCannon not detected" | Install manually before running: `npm install -g autocannon` or `npm install --save-dev autocannon`. |
| "No API routes found" | Verify that routes are in standard directories (`routes/`, `src/routes/`, `app/api/`, `pages/api/`). |
| High error rate on POST routes | Ensure endpoint accepts JSON payloads or verify payload requirements. |

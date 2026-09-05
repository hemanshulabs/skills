---
name: api-traffic
description: "Profile and benchmark API endpoints using autocannon. Diagnoses slow routes, measures latency percentiles (p50/p95/p99), detects error spikes, and recommends fixes. Use when the user says /api-traffic, asks to test/benchmark API performance, diagnose slow endpoints, or optimize API throughput."
---

# TrafficLens: API Traffic & Performance Benchmark

An operational engineering discipline for profiling APIs and catching performance regressions before production.

## Redact

Always redact credentials, authorization headers, API keys, and sensitive tokens. Output `<REDACTED>` in place of any secret.

---

## Phase 1: Verify Environment & Active Server

1. **Ensure `autocannon` is installed**:
   ```bash
   npx autocannon --version 2>/dev/null || npm install -g autocannon
   ```
2. **Confirm target API server**:
   Check if the API server is already running locally (standard ports: `3000`, `3001`, `8000`, `8080`, `5000`, `4000`).
   * If unreachable, stop and tell the user:
     > "Local API server not detected. Start your development server (e.g. `npm run dev`), then run `/api-traffic`."

---

## Phase 2: Discover & Read API Routes

Extract all defined HTTP endpoints in the project:
* **Automated Runner**:
  Execute the bundled helper from the skill directory or project root:
  ```bash
  node scripts/quick-scan.js
  # Or if executing from project root:
  node skills/api-traffic/scripts/quick-scan.js
  ```
* **Framework Coverage**:
  The discovery engine detects Express, Fastify, Next.js (App & Pages router), NestJS decorators, Hono, Koa, and Remix route modules.
* **Manual Inspection**:
  If needed, inspect route files in `src/routes/`, `routes/`, or `app/api/` to identify parameter shapes and HTTP methods (`GET`, `POST`, `PUT`, `DELETE`).

---

## Phase 3: Execute Controlled Benchmark

Run autocannon against discovered routes with safe development concurrency (default: 10 connections, 10s per route):
* **Read Endpoints (`GET`):**
  ```bash
  npx autocannon -c 10 -d 10 --json "http://localhost:<port><path>"
  ```
* **Write Endpoints (`POST`/`PUT`/`PATCH`):**
  Include JSON content-type and a realistic mock payload:
  ```bash
  npx autocannon -c 10 -d 10 -m POST -H "content-type: application/json" -b '{"query":"test","items":[{"id":"1","qty":1}]}' --json "http://localhost:<port><path>"
  ```

---

## Phase 4: Operational Diagnostics & Reporting

Evaluate the results against production SLO targets:
* **Latency SLO:** p95 < 200ms (Healthy), 200ms–500ms (Warning), > 500ms (Critical Regression).
* **Error Budget:** Error rate > 5% or non-zero timeouts is Critical.
* **Cache Opportunity:** Static GET endpoints with high repetition should leverage `Cache-Control: max-age=60`.

### Completion Criterion
Produce a compact, high-density markdown summary:

```markdown
## 🚦 TrafficLens API Performance Report

**Target:** `http://localhost:3000` | **Routes Tested:** <count> | **Load:** 10 conns (10s/route)

| Route | Method | RPS | p50 | p95 | p99 | Errors | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `/api/products` | `GET` | 2,410 | 2ms | 6ms | 11ms | 0 | ✅ Healthy |
| `/api/checkout` | `POST` | 3 | 2.6s | 2.8s | 3.1s | 1 | 🔴 Slow |

### ⚠️ Bottlenecks & Fix Recommendations

* **🔴 `POST /api/checkout`** — p95 2800ms exceeds 500ms SLO (+460%)
  * *Root cause:* Synchronous blocking I/O, slow database queries, or unindexed lookups.
  * *Fix:* Add database index on lookup column or wrap in background task queue.
```

*Rule: Keep the final output under 400 tokens. Lead with the table, highlight only problematic routes, and skip verbose prose for healthy routes.*

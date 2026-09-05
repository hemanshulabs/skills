---
name: api-traffic
description: "Profile and benchmark API endpoints using autocannon. Diagnoses slow routes, measures latency percentiles (p50/p95/p99), detects error spikes, and recommends fixes. Use when the user says /api-traffic, asks to test/benchmark API performance, diagnose slow endpoints, or optimize API throughput."
---

# TrafficLens: API Traffic & Performance Benchmark

An automated operational discipline for profiling backend APIs, detecting latency regressions, and validating service-level objectives (SLOs) before production.

## Secret Redaction

Always redact sensitive values in captured outputs. Replace API keys, bearer tokens, passwords, and session cookies with `<REDACTED>`.

---

## Phase 1: Environment & Server Verification

1. **Verify AutoCannon**:
   Ensure `autocannon` is installed and ready on the system:
   ```bash
   npx autocannon --version 2>/dev/null || npm install -g autocannon
   ```

2. **Verify Active API Server**:
   Verify that the target API server is running locally (probes `http://localhost:3000`, `3001`, `8000`, `8080`, `5000`, `4000`):
   * If no server responds, prompt the user:
     > "No active local server detected. Please start your backend development server (e.g., `npm run dev`) and re-run `/api-traffic`."

---

## Phase 2: Route Discovery

Extract all defined backend API endpoints across the codebase:

1. **Automated Discovery**:
   Run the bundled scanner from the project:
   ```bash
   node scripts/quick-scan.js
   # Or from repository root:
   node skills/api-traffic/scripts/quick-scan.js
   ```

2. **Supported Frameworks**:
   * **Express & Koa**: `app.get()`, `router.post()`, router mount prefixes (`app.use('/api/...')`).
   * **Next.js**: App Router (`app/api/**/route.ts`) and Pages Router (`pages/api/**/*.ts`).
   * **NestJS**: Controller route decorators (`@Get()`, `@Post()`, `@Controller()`).
   * **Fastify & Hono**: Route definitions (`fastify.get()`, `app.post()`).

---

## Phase 3: Controlled Benchmark

Execute load testing against active endpoints with lightweight, safe concurrency:

* **Default Load**: `10 connections`, `10 seconds per route`.
* **Read Requests (`GET`)**:
  ```bash
  npx autocannon -c 10 -d 10 --json "http://localhost:<port><path>"
  ```
* **Write Requests (`POST`, `PUT`, `PATCH`)**:
  Include JSON content-type and a realistic fixture body:
  ```bash
  npx autocannon -c 10 -d 10 -m POST -H "content-type: application/json" -b '{"test":true}' --json "http://localhost:<port><path>"
  ```

---

## Phase 4: Operational Diagnostics & Reporting

Evaluate performance against operational targets:
* **Latency SLO**: $p95 < 200\text{ms}$ is healthy. $p95 > 500\text{ms}$ is a critical regression.
* **Error Budget**: Error rates $> 5\%$ or non-zero timeouts require immediate investigation.
* **Cache Opportunities**: Endpoints returning identical static responses should suggest HTTP caching (`Cache-Control: public, max-age=60`).

---

### Completion Criteria

Phase 4 is complete when you present a clean, concise operational summary adhering to the following structure:

#### Summary Table
| Route | Method | RPS | p50 | p95 | p99 | Errors | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `/api/products` | `GET` | 2,410 | 2ms | 6ms | 11ms | 0 | ✅ Healthy |
| `/api/checkout` | `POST` | 3 | 2.6s | 2.8s | 3.1s | 1 | 🔴 Slow |

#### Diagnostic Findings (Flagged Routes Only)
* **🔴 `POST /api/checkout`** — Latency $p95 = 2.8\text{s}$ exceeds $500\text{ms}$ SLO (+460%)
  * *Root Cause:* Synchronous blocking I/O, heavy computation, or unindexed database queries.
  * *Remediation:* Defer processing to a background worker queue or add an index on order lookups.
* **🟡 `GET /api/config`** — High response repetition detected.
  * *Remediation:* Apply HTTP `Cache-Control: public, max-age=60` to reduce backend query overhead.

> **Token Limit**: Keep total response strictly under 400 tokens. Omit verbose explanations for healthy endpoints.

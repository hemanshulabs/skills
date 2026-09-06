# API Traffic Analyzer

[![skills.sh](https://img.shields.io/badge/skills.sh-api--traffic-black?logo=vercel)](https://skills.sh/hemanshulabs/skills/api-traffic)

Profile and benchmark backend API endpoints using AutoCannon. Automatically discover project routes, test active endpoints with controlled concurrency, measure latency percentiles (p50, p95, p99), and detect performance regressions.

> **Prerequisites:**
> - Node.js 18+ installed on system
> - A running local backend server (e.g. `http://localhost:3000`, `3001`, `8000`, `8080`)
> - `autocannon` installed (`npm install -g autocannon` or in project devDependencies)

---

## Quick Start

```bash
# Start your server, then run:
node skills/api-traffic/scripts/quick-scan.js
```

Or type `/api-traffic` in your AI coding agent.

---

## Why This Skill Exists

### #1: The Agent Guesses Latency Instead Of Measuring It

> "If you cannot measure it, you cannot improve it."
>
> Lord Kelvin

**The Problem**: AI agents are great at writing code that compiles and passes simple unit tests. But unit tests run with 1 mock request in isolation. In the real world, 50 concurrent users hit an unindexed database query or synchronous file write, and response times crater from 20ms to 3,000ms. Agents cannot fix bottlenecks they cannot see.

**The Fix**: Give the agent an automated profiling loop. Running **`/api-traffic`** spins up an in-process AutoCannon load harness against your running local server. The agent gets actual numbers: Requests Per Second (RPS), error counts, and latency percentiles.

### #2: The "Average Latency" Trap

> "Averages lie. The 99th percentile is where your users live when things go wrong."
>
> Gil Tene, *Understanding Latency*

**The Problem**: Developers often check average response time and assume everything is healthy. But if your average response time is 35ms while your **p99** is 2,400ms, 1 out of every 100 requests (or every 10th user on a multi-request page) experiences a freezing delay.

**The Fix**: Strict percentile-based SLO evaluation:

| Tier | p95 Latency | Error Rate | Status | Action |
|---|---|---|---|---|
| **Healthy** | `< 200ms` | `0%` | ✅ Healthy | None needed |
| **Warning** | `200ms – 500ms` | `< 1%` | 🟡 Warning | Check indexes & response payload size |
| **Critical** | `> 500ms` | `> 5%` | 🔴 Critical | Immediate triage: unblock synchronous I/O or queue tasks |

### #3: Hidden Repetition & Missing Cache Headers

> "The fastest request is the one you never make."

**The Problem**: Agents frequently generate static lookup endpoints (e.g. `/api/config`, `/api/categories`, `/api/metadata`) that query the database on every single incoming HTTP hit, without setting HTTP cache control headers.

**The Fix**: Automated cache opportunity detection. When `/api-traffic` detects high repetition and static payloads on `GET` routes, it recommends:
```http
Cache-Control: public, max-age=60, stale-while-revalidate=300
```
This single fix routinely cuts database load by 80%+ without touching application logic.

### #4: Secrets Leaking In Terminal Logs

> "Defense in depth begins with what leaves your terminal."

**The Problem**: Running manual cURL commands or raw load tests often prints authorization headers, Bearer tokens, cookies, and environment variables into the agent's context window.

**The Fix**: Strict redaction built into the runner scripts. Authorization headers, session cookies, and API keys are automatically intercepted and masked as `<REDACTED>` before anything is displayed.

---

## Example Output

```markdown
## 🚦 TrafficLens API Performance Report

Target: http://localhost:3000 | Routes Tested: 5 | Load: 10 conns (10s/route)

| Route | Method | RPS | p50 | p95 | p99 | Errors | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `/api/products` | `GET` | 2,410 | 2ms | 6ms | 11ms | 0 | ✅ Healthy |
| `/api/products/:id` | `GET` | 2,890 | 1ms | 4ms | 7ms | 0 | ✅ Healthy |
| `/api/config` | `GET` | 2,120 | 1ms | 5ms | 8ms | 0 | ✅ Healthy |
| `/api/search` | `POST` | 310 | 45ms | 110ms | 185ms | 0 | ✅ Healthy |
| `/api/checkout` | `POST` | 3 | 2.6s | 2.8s | 3.1s | 1 | 🔴 Slow |

### ⚠️ Bottlenecks & Fix Recommendations

* **🔴 `POST /api/checkout`** — Latency p95 = 2.8s exceeds 500ms SLO (+460%)
  * *Root Cause:* Synchronous payment gateway wait or unindexed order lookup.
  * *Fix:* Offload order processing to a background worker queue or add an index on customer order records.
* **🟡 `GET /api/config`** — High response repetition detected.
  * *Fix:* Add HTTP `Cache-Control: public, max-age=60` headers to eliminate redundant database hits.
```

---

## CLI Options

| Flag | Default | Description |
|---|---|---|
| `--project` | `.` (current dir) | Project workspace path to discover API routes |
| `--base-url` | auto-detected | Target base URL of running backend server |
| `--connections` | `10` | Number of concurrent connections per benchmark |
| `--duration` | `10` | Duration in seconds to test each route |

```bash
# Custom port target
node skills/api-traffic/scripts/quick-scan.js --base-url http://localhost:8080

# Stress test with higher concurrency and duration
node skills/api-traffic/scripts/quick-scan.js --connections 50 --duration 20

# Run in another project directory
node skills/api-traffic/scripts/quick-scan.js --project "../my-express-app"
```

---

## Supported Frameworks

Zero configuration route discovery across all modern JavaScript and TypeScript backends:

| Framework | Detection Support | Discovery Pattern |
|---|---|---|
| **Express & Koa** | Full | `app.get()`, `router.post()`, mount prefixes (`app.use('/api', router)`) |
| **Next.js (App Router)** | Full | `app/api/**/route.ts` (`GET`, `POST`, `PUT`, `DELETE` exports) |
| **Next.js (Pages Router)** | Full | `pages/api/**/*.ts` (handler functions) |
| **Fastify & Hono** | Full | `fastify.get()`, `app.post()`, router chains |
| **NestJS** | Full | `@Get()`, `@Post()`, `@Controller('/path')` decorators |
| **Remix & SvelteKit** | Full | `routes/**/*.server.ts`, `+server.ts` endpoints |

---

## Internal Scripts

| Script | Purpose |
|---|---|
| [`quick-scan.js`](scripts/quick-scan.js) | Single-command runner — discovers routes, detects server, runs benchmarks, formats report |
| [`discover-routes.js`](scripts/discover-routes.js) | Multi-framework static route parser |
| [`run-analysis.js`](scripts/run-analysis.js) | Parametric benchmark executor with p50/p95/p99 analysis and SLO matching |
| [`security.js`](scripts/security.js) | Security engine — route sanitization, URL validation, autocannon resolution, secret redaction |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "API Server Not Reachable" | Start your local API development server (`npm run dev`) before running the scan. |
| "AutoCannon not detected" | Install manually: `npm install -g autocannon` or `npm install --save-dev autocannon`. |
| "No API routes found" | Verify that routes are in standard directories (`routes/`, `src/routes/`, `app/api/`, `pages/api/`). |
| High error rate on POST routes | Ensure endpoint accepts JSON payloads or verify payload requirements. |

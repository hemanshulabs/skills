# Skills For Real Engineers & Production APIs

[![skills.sh](https://img.shields.io/badge/skills.sh-hemanshulabs%2Fskills-black?logo=vercel)](https://skills.sh/hemanshulabs/skills)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Runtime: Node.js](https://img.shields.io/badge/Runtime-Node.js%2018%2B-green.svg)]()

My agent skills for profiling, benchmarking, and optimizing backend systems — engineered for real production workloads, not vibe coding.

Building APIs that scale under pressure is hard. AI coding agents can generate endless routes, ORM queries, and controller logic at blinding speed. But without operational verification, agents also accelerate software entropy: introducing hidden N+1 database leaks, blocking event-loop handlers, and unindexed filters that crawl under real traffic.

These skills are designed to be small, zero-dependency, composable, and immediately actionable. They give your AI coding agent operational eyes: automatically discovering routes, measuring latency percentiles (p50, p95, p99), detecting regressions against production SLOs, and diagnosing surgical code fixes.

Hack around with them. Make them your own. Enjoy.

---

## Installation (30-second setup)

Two ways in, two philosophies. **The [Claude Code plugin](https://code.claude.com/docs/en/plugins)** installs the bundle as a managed setup that updates automatically. **[skills.sh](https://skills.sh/hemanshulabs/skills)** copies editable skill files directly into your project or global agent directory, so you can adapt them to your stack.

### 1. Get the skills

<details open>
<summary><strong>Codex, Cursor, Windsurf, and other agents</strong></summary>

Install globally to all your coding agents with one command:

```bash
npx skills add hemanshulabs/skills --all -g
```

Or install only the specific skill to your current project:

```bash
npx skills add hemanshulabs/skills@api-traffic
```

Works out of the box with Claude Code, Cursor, Codex CLI, Windsurf, GitHub Copilot, Cline, Roo, Antigravity, and [40+ agents](https://skills.sh).

</details>

<details>
<summary><strong>Claude Code Plugin</strong></summary>

From your terminal:

```bash
claude plugins install skills
```

Or from inside an active Claude Code session:

```text
/plugin install skills
```

</details>

<details>
<summary><strong>For tinkerers</strong></summary>

Install directly into your repository:

```bash
npx skills add hemanshulabs/skills
```

It writes the skill into your project as ordinary, readable files you own and can edit (`skills/api-traffic/`). Pull updates whenever you want:

```bash
npx skills update
```

</details>

### 2. Run `/api-traffic`

Start your local development server (e.g. `npm run dev`), then type in your agent:

```text
/api-traffic
```

### 3. Bam — you're ready to go.

---

## Why These Skills Exist

I built these skills as a way to fix common failure modes I see when developers pair with Claude Code, Cursor, and other coding agents on backend APIs.

### #1: The Agent Guesses Latency Instead Of Measuring It

> "If you cannot measure it, you cannot improve it."
>
> Lord Kelvin

**The Problem**: AI agents are great at writing code that compiles and passes simple unit tests. But unit tests run with 1 mock request in isolation. In the real world, 50 concurrent users hit an unindexed database query or synchronous file write, and response times crater from 20ms to 3,000ms. Agents cannot fix bottlenecks they cannot see.

**The Fix**: Give the agent an automated profiling loop. Running **[`/api-traffic`](./skills/api-traffic/SKILL.md)** spins up an in-process AutoCannon load harness against your running local server. The agent gets actual numbers: Requests Per Second (RPS), error counts, and latency percentiles.

---

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

The skill isolates and flags only the routes breaching your SLO threshold, omitting noise so your agent stays strictly within token limits.

---

### #3: Hidden Repetition & Missing Cache Headers

> "The fastest request is the one you never make."

**The Problem**: Agents frequently generate static lookup endpoints (e.g. `/api/config`, `/api/categories`, `/api/metadata`) that query the database on every single incoming HTTP hit, without setting HTTP cache control headers.

**The Fix**: Automated cache opportunity detection. When `/api-traffic` detects high repetition and static payloads on `GET` routes, it recommends:
```http
Cache-Control: public, max-age=60, stale-while-revalidate=300
```
This single fix routinely cuts database load by 80%+ without touching application logic.

---

### #4: Secrets Leaking In Terminal Logs

> "Defense in depth begins with what leaves your terminal."

**The Problem**: Running manual cURL commands or raw load tests often prints authorization headers, Bearer tokens, cookies, and environment variables into the agent's context window.

**The Fix**: Strict redaction built into the runner scripts. Authorization headers, session cookies, and API keys are automatically intercepted and masked as `<REDACTED>` before anything is displayed.

---

## Example Output

When you run `/api-traffic`, here is what your agent generates:

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

## Reference

These split on how they operate:

### User-Invoked

- **[`/api-traffic`](./skills/api-traffic/SKILL.md)**: Profile and benchmark API endpoints using AutoCannon. Automatically discovers backend routes, measures latency percentiles (p50, p95, p99), detects error spikes, and recommends code-level fixes.

### Engine Scripts (Inside Skill)

- **[`quick-scan.js`](./skills/api-traffic/scripts/quick-scan.js)**: Single-command runner that checks for `autocannon`, pings local ports (`3000`, `3001`, `8000`, `8080`, `5000`), discovers routes, runs benchmarks, and formats the markdown table.
- **[`discover-routes.js`](./skills/api-traffic/scripts/discover-routes.js)**: Multi-framework static AST parser that detects routes across Express, Fastify, Next.js (App & Pages), NestJS, Hono, Koa, Remix, and SvelteKit.
- **[`run-analysis.js`](./skills/api-traffic/scripts/run-analysis.js)**: Parametric benchmark executor that computes p50/p95/p99 latency percentiles and matches findings against production SLO rules.
- **[`detection-rules.md`](./skills/api-traffic/references/detection-rules.md)**: Reference guide defining healthy, warning, and critical thresholds for latency, throughput, and error budgets.

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

## Operational Safeguards

* **Zero Runtime Dependencies**: Built purely on Node.js standard modules (`node:fs`, `node:path`, `node:child_process`). Runs on any machine with Node.js 18+.
* **Safe Local Concurrency**: Default load tests run with lightweight concurrency (`10 connections`, `10 seconds`) to protect local databases and services.
* **Strict Secret Redaction**: All Authorization tokens, session cookies, passwords, and sensitive keys are automatically masked as `<REDACTED>`.
* **Read-Only Inspection**: Does not alter your application code without human confirmation.

---

## Author

Crafted with care by **Hemanshu Patil** ([@hemanshulabs](https://github.com/hemanshulabs)).

* **GitHub**: [github.com/hemanshulabs](https://github.com/hemanshulabs)
* **Skills Registry**: [skills.sh/hemanshulabs/skills](https://skills.sh/hemanshulabs/skills)

---

## License

MIT © [Hemanshu Patil](LICENSE)

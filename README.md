# trafficlens

A collection of reusable skills for Claude Code, Cursor, Codex CLI, and other coding agents — automated API traffic profiling, load testing, and latency bottleneck diagnosis.

[![skills.sh](https://skills.sh/b/hemanshulabs/trafficlens)](https://skills.sh/hemanshulabs/trafficlens)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Runtime: Node.js](https://img.shields.io/badge/Runtime-Node.js%2018%2B-green.svg)]()
[![Dependencies: 0](https://img.shields.io/badge/Dependencies-0-brightgreen.svg)]()

## Available Skills

### API Operations

| Skill | Description |
|---|---|
| [`api-traffic`](./skills/api-traffic/) | Profile and benchmark API endpoints using AutoCannon. Automatically discover backend routes, measure latency percentiles ($p50$, $p95$, $p99$), detect error spikes, and recommend code-level fixes. |

---

## Quick Start

Install all skills globally to **all supported coding agents** with one command:

```bash
npx skills add hemanshulabs/trafficlens --all -g
```

Update to the latest version:

```bash
npx skills update
```

---

## Installation

Install using [npx skills](https://skills.sh):

### Install to all agents at once

```bash
# Global — available in all projects, all agents
npx skills add hemanshulabs/trafficlens --all -g

# Project-level — current project only, all agents
npx skills add hemanshulabs/trafficlens --all
```

### Install to a specific agent

```bash
npx skills add hemanshulabs/trafficlens -a claude-code -g
npx skills add hemanshulabs/trafficlens -a codex -g
npx skills add hemanshulabs/trafficlens -a cursor -g
```

Other supported agents: `windsurf`, `github-copilot`, `cline`, `roo`, `gemini-cli`, `goose`, `kilo`, `augment`, `opencode`, and [40+ more](https://skills.sh).

> **Project vs Global**: Without `-g`, skills are installed into the current project directory for the selected agent. With `-g`, they go to that agent's global skills directory and are available across all projects.

### Claude Code Plugin Installation

```bash
claude plugins install trafficlens-skills
```

Or from inside an active Claude Code session:

```text
/plugin install trafficlens-skills
```

---

## Usage

Start your local development server (e.g. `npm run dev`), then type in your coding agent:

```text
/api-traffic
```

You can also prompt naturally:
* *"Benchmark my API routes and find any slow endpoints"*
* *"Run a load test against checkout"*
* *"Check if any routes exceed our 200ms SLO latency budget"*

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
  * *Root Cause:* Synchronous blocking payment wait or unindexed database query.
  * *Fix:* Move order fulfillment to a background worker queue or add an index on order lookups.
* **🟡 `GET /api/config`** — High response repetition detected.
  * *Fix:* Add HTTP `Cache-Control: public, max-age=60` headers to eliminate redundant database hits.
```

---

## Supported Frameworks

TrafficLens automatically discovers routes without configuration across:

| Framework | Detection Support | Patterns |
|---|---|---|
| **Express & Koa** | Full | `app.get()`, `router.post()`, router mount prefixes (`app.use('/api', router)`) |
| **Next.js (App Router)** | Full | `app/api/**/route.ts` (`GET`, `POST`, `PUT`, `DELETE` exports) |
| **Next.js (Pages Router)** | Full | `pages/api/**/*.ts` (handler functions) |
| **Fastify & Hono** | Full | `fastify.get()`, `app.post()` |
| **NestJS** | Full | `@Get()`, `@Post()`, `@Controller('/path')` decorators |
| **Remix & SvelteKit** | Full | `routes/**/*.server.ts`, `+server.ts` endpoints |

---

## Updating

```bash
# Check for updates
npx skills check

# Update all globally installed skills to latest
npx skills update
```

To update project-level installs, re-run the `npx skills add` command.

---

## Operational Safeguards

* **Zero Runtime Dependencies**: Built purely on Node.js standard modules (`node:fs`, `node:path`, `node:child_process`). Runs on any machine with Node.js 18+.
* **Safe Local Concurrency**: Default load tests run with lightweight concurrency (`10 connections`, `10 seconds`) to protect local databases and services.
* **Strict Secret Redaction**: All Authorization tokens, session cookies, passwords, and sensitive keys are automatically masked as `<REDACTED>`.
* **Read-Only Inspection**: TrafficLens does not alter your application code without human confirmation.

---

## License

MIT © [TrafficLens Team](LICENSE)

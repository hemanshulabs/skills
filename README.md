# Skills

[![skills.sh](https://img.shields.io/badge/skills.sh-hemanshulabs%2Fskills-black?logo=vercel)](https://skills.sh/hemanshulabs/skills)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Runtime: Node.js](https://img.shields.io/badge/Runtime-Node.js%2018%2B-green.svg)]()

A collection of agent skills for profiling, benchmarking, and optimizing production systems — built for AI coding agents like Claude Code, Cursor, Codex, Windsurf, GitHub Copilot, and [40+ others](https://skills.sh).

Each skill is small, zero-dependency, composable, and immediately actionable. Install the full collection or pick individual skills for your stack.

---

## Skills Catalog

| Skill | Command | Description | Docs |
|---|---|---|---|
| **[api-traffic](./skills/api-traffic/)** | `/api-traffic` | Profile API endpoints with AutoCannon. Auto-discovers routes, measures p50/p95/p99 latency, detects regressions against SLOs, and recommends fixes. | [README](./skills/api-traffic/README.md) |
| *More coming soon* | | | |

---

## Installation

<details open>
<summary><strong>All agents (Codex, Cursor, Windsurf, Copilot, Cline, etc.)</strong></summary>

Install all skills globally:

```bash
npx skills add hemanshulabs/skills --all -g
```

Or install a specific skill:

```bash
npx skills add hemanshulabs/skills@api-traffic
```

</details>

<details>
<summary><strong>Claude Code Plugin</strong></summary>

```bash
claude plugins install skills
```

Or inside an active session:

```text
/plugin install skills
```

</details>

<details>
<summary><strong>Manual / tinkerers</strong></summary>

Install into your repository as editable files:

```bash
npx skills add hemanshulabs/skills
```

Update anytime:

```bash
npx skills update
```

</details>

---

## Design Principles

Every skill in this collection follows these rules:

- **Zero runtime dependencies** — built purely on Node.js standard modules (`node:fs`, `node:path`, `node:child_process`).
- **Shell-free execution** — all process execution uses `spawnSync` with `{ shell: false }`. No shell interpreter is ever invoked.
- **Ingestion-boundary sanitization** — all external data (route paths, file contents, user input) is validated and sanitized at the point of ingestion, before it reaches any processing logic.
- **No automatic package installation** — required tools must be pre-installed. If missing, the skill exits cleanly with manual installation instructions.
- **Secret redaction** — sensitive tokens, credentials, and API keys are automatically masked in all output.
- **Read-only by default** — skills inspect and report. They never modify application code without explicit human confirmation.

For the full security policy, see [SECURITY.md](SECURITY.md).

---

## Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** — breaking changes to skill interfaces or CLI arguments
- **MINOR** — new skills, new features within existing skills
- **PATCH** — bug fixes, security patches, documentation updates

Current version: **0.2.0** · See [CHANGELOG.md](CHANGELOG.md) for the full release history.

---

## Repository Structure

```
skills/
├── api-traffic/           # API profiling & load testing skill
│   ├── SKILL.md           # Agent-facing skill manifest
│   ├── README.md          # Human-facing documentation
│   ├── scripts/           # Engine scripts
│   │   ├── quick-scan.js
│   │   ├── discover-routes.js
│   │   ├── run-analysis.js
│   │   └── security.js
│   ├── references/        # SLO baselines & detection rules
│   └── agents/            # Agent-specific configs
├── <future-skill>/        # Next skill goes here
│   ├── SKILL.md
│   ├── README.md
│   └── scripts/
├── CHANGELOG.md
├── SECURITY.md
├── LICENSE
├── package.json
└── skills.sh.json         # skills.sh registry manifest
```

---

## Contributing a New Skill

1. Create a new directory under `skills/<skill-name>/`
2. Add a `SKILL.md` with YAML frontmatter (`name`, `description`) and agent instructions
3. Add a `README.md` with human-facing documentation, examples, and troubleshooting
4. Place scripts in `scripts/` — follow the security patterns in [`security.js`](./skills/api-traffic/scripts/security.js)
5. Register the skill in [`skills.sh.json`](./skills.sh.json)
6. Update [`CHANGELOG.md`](./CHANGELOG.md)

---

## Author

Crafted by **Hemanshu Patil** ([@hemanshulabs](https://github.com/hemanshulabs)).

* **GitHub**: [github.com/hemanshulabs](https://github.com/hemanshulabs)
* **Skills Registry**: [skills.sh/hemanshulabs/skills](https://skills.sh/hemanshulabs/skills)

---

## License

MIT © [Hemanshu Patil](LICENSE)

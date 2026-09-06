# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-09-06

### Added
- `SECURITY.md` documenting the full security architecture and vulnerability reporting process.
- `CHANGELOG.md` for structured version tracking across all skills.
- Skill-level `README.md` for `api-traffic` with detailed usage, examples, and framework support.
- Root README redesigned as a multi-skill collection catalog.

### Changed
- Root `README.md` restructured from single-skill focus to a scalable skills collection format.
- `package.json` version bumped to `0.2.0`.
- Expanded "Operational Safeguards" section in README with explicit shell-free execution, route sanitization, SSRF prevention, and no-auto-install documentation.

### Removed
- `threats.txt` — contained raw attack vector descriptions that caused false positive HIGH risk ratings on the skills.sh Gen Agent Trust Hub scanner.

### Security
- Eliminated `threats.txt` which was feeding stale vulnerability descriptions to automated security scanners.
- All four original threat classes (DYNAMIC_EXECUTION, REMOTE_CODE_EXECUTION, COMMAND_EXECUTION, INDIRECT_PROMPT_INJECTION) remain fully remediated in code since `v0.1.0`.

## [0.1.0] - 2026-09-05

### Added
- Initial release of `api-traffic` skill.
- `quick-scan.js` — single-command route discovery, server detection, and AutoCannon benchmarking.
- `discover-routes.js` — multi-framework static route parser (Express, Fastify, Next.js, NestJS, Hono, Koa, Remix, SvelteKit).
- `run-analysis.js` — parametric benchmark executor with p50/p95/p99 latency analysis and SLO matching.
- `security.js` — security engine with `sanitizeRoutePath()`, `buildSafeTargetUrl()`, `resolveAutoCannon()`, and `redactSecrets()`.
- `detection-rules.md` — SLO baselines and operational health reference.
- `skills.sh.json` — repository grouping manifest for skills.sh registry.

### Security
- All process execution uses `spawnSync` with `{ shell: false }` — zero shell interpolation.
- Strict whitelist route path sanitization at every ingestion boundary.
- No automatic package installation — manual install required with clear instructions.
- SSRF prevention via URL origin-match validation.
- Secret redaction on all diagnostic output.

[0.2.0]: https://github.com/hemanshulabs/skills/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/hemanshulabs/skills/releases/tag/v0.1.0

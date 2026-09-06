# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.2.x   | ✅        |
| 0.1.x   | ✅        |

## Security Architecture

This skill repository has been hardened against the following threat classes:

### Command Injection Prevention

All process execution uses `child_process.spawnSync` with `{ shell: false }` and discrete argument arrays. No shell interpreter (`cmd.exe`, `sh`, `bash`) is ever invoked. The codebase contains **zero** calls to `execSync`, `exec`, or any shell-interpolating API.

**Enforced in:** [`security.js`](skills/api-traffic/scripts/security.js)

### Route Path Sanitization

All route paths extracted from project source files are validated at the ingestion boundary through `sanitizeRoutePath()` before being used in any operation. The function enforces:

- Strict whitelist regex: only `[a-zA-Z0-9_.\-/:~%]` characters allowed
- Rejects shell metacharacters: `` ` ``, `$`, `;`, `&`, `|`, `>`, `<`, `"`, `'`, `\`, `()`, `{}`
- Rejects path traversal sequences (`..`, `.`)
- Rejects control characters and whitespace
- Enforces a 512-character length limit

**Enforced in:** [`security.js`](skills/api-traffic/scripts/security.js), [`discover-routes.js`](skills/api-traffic/scripts/discover-routes.js), [`quick-scan.js`](skills/api-traffic/scripts/quick-scan.js), [`run-analysis.js`](skills/api-traffic/scripts/run-analysis.js)

### URL Origin Validation (SSRF Prevention)

`buildSafeTargetUrl()` constructs benchmark target URLs using `new URL()` parsing and strictly verifies that the resolved target origin matches the user-specified base URL origin. Only `http:` and `https:` protocols are permitted.

**Enforced in:** [`security.js`](skills/api-traffic/scripts/security.js)

### No Automatic Package Installation

The skill **never** installs packages from any registry at runtime. `resolveAutoCannon()` checks for existing local and global AutoCannon installations without invoking shell interpreters. If AutoCannon is not found, the process exits with code 1 and prints manual installation instructions.

**Enforced in:** [`security.js`](skills/api-traffic/scripts/security.js), [`quick-scan.js`](skills/api-traffic/scripts/quick-scan.js), [`run-analysis.js`](skills/api-traffic/scripts/run-analysis.js)

### Secret Redaction

`redactSecrets()` automatically strips Authorization headers, Bearer tokens, session cookies, passwords, and API keys from all error messages and diagnostic output before they reach the agent context window.

**Enforced in:** [`security.js`](skills/api-traffic/scripts/security.js)

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Email: [security@hemanshulabs.com](mailto:security@hemanshulabs.com) or open a [GitHub Security Advisory](https://github.com/hemanshulabs/skills/security/advisories/new)
3. Include a description of the vulnerability and steps to reproduce
4. You will receive a response within 48 hours

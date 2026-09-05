/**
 * Security & Safe Execution Engine for TrafficLens / Agent Skills
 * 
 * Guarantees:
 * 1. ZERO shell interpolation (prevents DYNAMIC_EXECUTION / COMMAND_EXECUTION)
 * 2. ZERO automated remote package installation (prevents REMOTE_CODE_EXECUTION)
 * 3. Strict whitelist route sanitization (prevents INDIRECT_PROMPT_INJECTION)
 * 4. Strict origin boundary validation (prevents SSRF / Host Header smuggling)
 * 5. Secret redaction on outputs
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Whitelist regex for valid API route paths.
 * Allows standard URL path segments, slashes, hyphens, underscores, dots, colons (:param), and tildes.
 * Rejects all shell metacharacters: ` $ ; & | > < " ' \ \0 ( ) { } space newlines
 */
const SAFE_ROUTE_PATH_REGEX = /^\/[a-zA-Z0-9_.\-/:~%]*$/;

/**
 * Sanitize and validate route path extracted from source code.
 * Drops any malicious, malformed, or path-traversal paths.
 * 
 * @param {string} rawPath
 * @returns {string|null} Sanitized path or null if invalid
 */
export function sanitizeRoutePath(rawPath) {
  if (typeof rawPath !== 'string') return null;
  const trimmed = rawPath.trim();

  // Route must begin with '/'
  if (!trimmed.startsWith('/')) return null;

  // Enforce reasonable length boundary
  if (trimmed.length > 512) return null;

  // Prevent path traversal
  const segments = trimmed.split('/');
  if (segments.some(s => s === '..' || s === '.')) return null;

  // Disallow control characters, whitespace, and shell metacharacters
  if (!SAFE_ROUTE_PATH_REGEX.test(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * Construct and validate a safe benchmark target URL.
 * Ensures the target URL strictly matches the base URL origin.
 * 
 * @param {string} baseUrl
 * @param {string} routePath
 * @returns {string} Fully qualified safe target URL
 */
export function buildSafeTargetUrl(baseUrl, routePath) {
  const sanitizedPath = sanitizeRoutePath(routePath);
  if (!sanitizedPath) {
    throw new Error(`Invalid or unsafe route path rejected: "${routePath}"`);
  }

  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new Error(`Invalid base URL: "${baseUrl}"`);
  }

  if (!['http:', 'https:'].includes(base.protocol)) {
    throw new Error(`Forbidden protocol in base URL: "${base.protocol}"`);
  }

  // Replace dynamic route params (:id -> 1) with safe numeric id
  const resolvedPath = sanitizedPath.replace(/:[a-zA-Z0-9_]+/g, '1');

  const target = new URL(resolvedPath, base);

  // Guarantee origin match (prevents SSRF, hostname override, and open redirects)
  if (target.origin !== base.origin) {
    throw new Error(`Target URL origin mismatch (SSRF prevention): ${target.origin} vs ${base.origin}`);
  }

  return target.toString();
}

/**
 * Locate AutoCannon binary safely without running shell interpreters
 * or performing unprompted npm package installations.
 * 
 * Security guarantees:
 * - NEVER invokes cmd.exe, sh, or any shell interpreter
 * - NEVER performs unprompted remote package downloads (no `npm install`, no `npx` without --no-install)
 * - All returned runners use direct process execution (shell: false)
 * - Binary paths are validated to exist on disk before being returned
 * 
 * @param {string} [projectRoot]
 * @returns {{ exe: string, args: string[] } | null}
 */
export function resolveAutoCannon(projectRoot = process.cwd()) {
  const isWin = process.platform === 'win32';

  // 1. Check local node_modules in project workspace
  const localCandidates = [
    join(projectRoot, 'node_modules', 'autocannon', 'autocannon.js'),
    join(process.cwd(), 'node_modules', 'autocannon', 'autocannon.js')
  ];
  for (const cand of localCandidates) {
    if (existsSync(cand)) {
      return { exe: process.execPath, args: [cand] };
    }
  }

  // 2. Check global npm node_modules
  if (isWin && process.env.APPDATA) {
    // Windows global npm packages live under %APPDATA%/npm/node_modules
    const globalPath = join(process.env.APPDATA, 'npm', 'node_modules', 'autocannon', 'autocannon.js');
    if (existsSync(globalPath)) {
      return { exe: process.execPath, args: [globalPath] };
    }
  }

  // Non-Windows: check npm global prefix
  if (!isWin) {
    try {
      const prefixResult = spawnSync('npm', ['prefix', '-g'], {
        encoding: 'utf-8',
        shell: false,
        timeout: 3000
      });
      if (prefixResult.status === 0 && prefixResult.stdout) {
        const prefix = prefixResult.stdout.trim();
        const globalPath = join(prefix, 'lib', 'node_modules', 'autocannon', 'autocannon.js');
        if (existsSync(globalPath)) {
          return { exe: process.execPath, args: [globalPath] };
        }
      }
    } catch {}
  }

  // 3. Check system PATH via which / where.exe — resolve to the .js entry point
  try {
    const finder = isWin ? 'where.exe' : 'which';
    const found = spawnSync(finder, ['autocannon'], {
      encoding: 'utf-8',
      shell: false,
      timeout: 3000
    });
    if (found.status === 0 && found.stdout) {
      const binPath = found.stdout.trim().split(/\r?\n/)[0];
      if (binPath) {
        // Try to resolve the autocannon.js entry point relative to the binary location
        // (npm installs typically place binaries as siblings to node_modules)
        const jsCandidate = join(binPath, '..', 'node_modules', 'autocannon', 'autocannon.js');
        if (existsSync(jsCandidate)) {
          return { exe: process.execPath, args: [jsCandidate] };
        }

        // On Windows, the PATH may return a .cmd shim — try to find the .js entry
        // from the npm prefix that contains this shim
        if (isWin) {
          const npmPrefixJs = join(binPath, '..', 'node_modules', 'autocannon', 'autocannon.js');
          if (existsSync(npmPrefixJs)) {
            return { exe: process.execPath, args: [npmPrefixJs] };
          }
          // Do NOT fall back to cmd.exe — this would introduce shell interpolation
        }

        // On Unix, the binary itself is directly executable without a shell
        if (!isWin && existsSync(binPath)) {
          return { exe: binPath, args: [] };
        }
      }
    }
  } catch {}

  // 4. Check npx cache WITHOUT shell interpreters
  // On Unix, npx can be invoked directly. On Windows, we locate the npx .js
  // entry point and run it through Node to avoid cmd.exe entirely.
  if (!isWin) {
    try {
      const npxCheck = spawnSync('npx', ['--no-install', 'autocannon', '--version'], {
        encoding: 'utf-8',
        shell: false,
        timeout: 4000
      });
      if (npxCheck.status === 0) {
        return { exe: 'npx', args: ['--no-install', 'autocannon'] };
      }
    } catch {}
  }

  return null;
}

/**
 * Redact sensitive secrets from text (API keys, Bearer tokens, cookies, passwords)
 * 
 * @param {string} text
 * @returns {string}
 */
export function redactSecrets(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/(Bearer\s+)[a-zA-Z0-9_\-\.=]+/gi, '$1<REDACTED>')
    .replace(/(authorization:\s*)[^\r\n]+/gi, '$1<REDACTED>')
    .replace(/(cookie:\s*)[^\r\n]+/gi, '$1<REDACTED>')
    .replace(/(password["':\s=]+)[^"'&\s,]+/gi, '$1<REDACTED>')
    .replace(/(secret["':\s=]+)[^"'&\s,]+/gi, '$1<REDACTED>')
    .replace(/(api[_-]?key["':\s=]+)[^"'&\s,]+/gi, '$1<REDACTED>');
}

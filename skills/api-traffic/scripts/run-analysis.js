#!/usr/bin/env node

/**
 * TrafficLens — Run autocannon against discovered routes and analyze results.
 * 
 * Usage: node run-analysis.js <routes_json_file_or_stdin> [--base-url http://localhost:3000] [--connections 10] [--duration 10]
 * 
 * Input: JSON with { routes: [{ method, path }] }
 * Output: Structured markdown report with findings
 */

import { spawnSync } from 'node:child_process';
import { sanitizeRoutePath, buildSafeTargetUrl, resolveAutoCannon, redactSecrets } from './security.js';

// Parse CLI args
const args = process.argv.slice(2);
let baseUrl = 'http://localhost:3000';
let connections = 10;
let duration = 10;
let inputFile = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--base-url' && args[i + 1]) { baseUrl = args[++i]; }
  else if (args[i] === '--connections' && args[i + 1]) { connections = parseInt(args[++i], 10); }
  else if (args[i] === '--duration' && args[i + 1]) { duration = parseInt(args[++i], 10); }
  else if (!args[i].startsWith('--')) { inputFile = args[i]; }
}

// Read routes from file or stdin
let routesData;
try {
  if (inputFile) {
    const { readFileSync } = await import('node:fs');
    routesData = JSON.parse(readFileSync(inputFile, 'utf-8'));
  } else {
    // Read from stdin
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    routesData = JSON.parse(Buffer.concat(chunks).toString());
  }
} catch (err) {
  console.error(`❌ Failed to parse routes input: ${redactSecrets(err.message)}`);
  process.exit(1);
}

const rawRoutes = Array.isArray(routesData) ? routesData : (routesData.routes || []);
const VALID_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

// Sanitize all ingested routes to prevent command injection & indirect injection
const routes = [];
for (const r of rawRoutes) {
  if (!r || typeof r.path !== 'string') continue;
  const safePath = sanitizeRoutePath(r.path);
  if (!safePath) {
    console.error(`⚠️ Skipping invalid/unsafe route path: ${JSON.stringify(r.path)}`);
    continue;
  }
  const method = typeof r.method === 'string' ? r.method.toUpperCase() : 'GET';
  if (!VALID_METHODS.has(method)) {
    console.error(`⚠️ Skipping unsupported HTTP method: ${JSON.stringify(r.method)}`);
    continue;
  }
  routes.push({ ...r, method, path: safePath });
}

if (routes.length === 0) {
  console.error('⚠️ No valid routes found to analyze.');
  process.exit(0);
}

// Ensure autocannon is available without unprompted remote package installation
const autoCannonRunner = resolveAutoCannon(process.cwd());
if (!autoCannonRunner) {
  console.error('❌ [TrafficLens] AutoCannon is required for benchmarking but was not found on your system.');
  console.error('Please install it manually before running the analysis:');
  console.error('  npm install -g autocannon');
  console.error('or add it to your project devDependencies:');
  console.error('  npm install --save-dev autocannon');
  process.exit(1);
}

// Thresholds
const THRESHOLDS = {
  p95_critical: 500,   // ms
  p95_warning: 200,    // ms
  error_rate_critical: 0.10,
  error_rate_warning: 0.05,
};

/**
 * Run autocannon against a single route with zero shell interpolation
 */
function runRoute(route) {
  let targetUrl;
  try {
    targetUrl = buildSafeTargetUrl(baseUrl, route.path);
  } catch (err) {
    return { error: redactSecrets(err.message), route };
  }

  const method = (route.method || 'GET').toUpperCase();
  const autocannonArgs = [
    ...autoCannonRunner.args,
    '-c', String(connections),
    '-d', String(duration),
    '--json'
  ];

  if (method !== 'GET') {
    autocannonArgs.push('-m', method);
    autocannonArgs.push('-H', 'content-type: application/json');
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      autocannonArgs.push('-b', JSON.stringify({ test: true }));
    }
  }

  autocannonArgs.push(targetUrl);

  try {
    const proc = spawnSync(autoCannonRunner.exe, autocannonArgs, {
      encoding: 'utf-8',
      timeout: (duration + 15) * 1000,
      shell: false,
      maxBuffer: 10 * 1024 * 1024
    });

    if (proc.error) {
      return { error: redactSecrets(proc.error.message), route };
    }

    if (proc.status !== 0 && !proc.stdout) {
      return { error: redactSecrets(proc.stderr || `Process exited with code ${proc.status}`), route };
    }

    return JSON.parse(proc.stdout);
  } catch (err) {
    return { error: redactSecrets(err.message), route };
  }
}

/**
 * Analyze a single autocannon result
 */
function analyze(result, route) {
  if (result.error) {
    return {
      route: `${route.method} ${route.path}`,
      status: '❌ Error',
      severity: 'critical',
      rps: 0, p50: 0, p95: 0, p99: 0,
      errors: 1, timeouts: 0,
      issues: [`Connection failed: ${redactSecrets(String(result.error))}`],
    };
  }

  const rps = Math.round(result.requests?.average || 0);
  const p50 = result.latency?.p50 || 0;
  const p95 = result.latency?.p95 || 0;
  const p99 = result.latency?.p99 || 0;
  const errors = result.errors || 0;
  const timeouts = result.timeouts || 0;
  const non2xx = result.non2xx || 0;
  const total = result.requests?.total || 1;
  const errorRate = (errors + non2xx) / total;

  const issues = [];
  let severity = 'healthy';
  let status = '✅ Healthy';

  // Slow endpoint detection
  if (p95 > THRESHOLDS.p95_critical) {
    issues.push(`p95 latency ${p95}ms exceeds ${THRESHOLDS.p95_critical}ms SLO by ${Math.round((p95 / THRESHOLDS.p95_critical - 1) * 100)}%`);
    severity = 'critical';
    status = '🔴 Slow';
  } else if (p95 > THRESHOLDS.p95_warning) {
    issues.push(`p95 latency ${p95}ms approaching SLO threshold`);
    if (severity === 'healthy') { severity = 'warning'; status = '🟡 Warn'; }
  }

  // Error detection
  if (errorRate > THRESHOLDS.error_rate_critical) {
    issues.push(`Error rate ${(errorRate * 100).toFixed(1)}% — ${errors} errors, ${non2xx} non-2xx out of ${total} requests`);
    severity = 'critical';
    status = '🔴 Errors';
  } else if (errorRate > THRESHOLDS.error_rate_warning) {
    issues.push(`Error rate ${(errorRate * 100).toFixed(1)}% above ${THRESHOLDS.error_rate_warning * 100}% threshold`);
    if (severity === 'healthy') { severity = 'warning'; status = '🟡 Errors'; }
  }

  // Timeout detection
  if (timeouts > 0) {
    issues.push(`${timeouts} requests timed out`);
    if (severity === 'healthy') { severity = 'warning'; status = '🟡 Timeouts'; }
  }

  // Low throughput
  if (rps < 100 && severity === 'healthy') {
    issues.push(`Low throughput: ${rps} req/s under ${connections} connections`);
    severity = 'info';
    status = '🔵 Low RPS';
  }

  return {
    route: `${route.method} ${route.path}`,
    status, severity, rps, p50, p95, p99,
    errors: errors + non2xx, timeouts, issues,
  };
}

/**
 * Format milliseconds for display
 */
function fmtMs(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

// ── Run analysis ──

console.error(`\n🔍 TrafficLens — Testing ${routes.length} routes against ${baseUrl}\n`);

const results = [];
for (const route of routes) {
  const label = `${route.method} ${route.path}`;
  console.error(`  ⏳ ${label} ...`);
  const raw = runRoute(route);
  const analysis = analyze(raw, route);
  results.push(analysis);
  console.error(`  ${analysis.status} ${label} — ${analysis.rps} rps, p95: ${fmtMs(analysis.p95)}`);
}

// ── Generate report ──

const issues = results.filter(r => r.severity !== 'healthy');
const criticals = results.filter(r => r.severity === 'critical');

let report = `## 🔍 API Traffic Analysis\n\n`;
report += `**${routes.length} routes tested** | ${connections} connections | ${duration}s per route`;
if (criticals.length > 0) {
  report += ` | 🔴 **${criticals.length} critical issue(s)**`;
}
report += `\n\n`;

// Summary table
report += `| Route | Method | RPS | p50 | p95 | p99 | Errors | Status |\n`;
report += `|---|---|---|---|---|---|---|---|\n`;
for (const r of results) {
  report += `| ${r.route.split(' ')[1]} | ${r.route.split(' ')[0]} | ${r.rps.toLocaleString()} | ${fmtMs(r.p50)} | ${fmtMs(r.p95)} | ${fmtMs(r.p99)} | ${r.errors} | ${r.status} |\n`;
}

// Issues section
if (issues.length > 0) {
  report += `\n### Issues Found\n\n`;
  for (const r of issues) {
    const icon = r.severity === 'critical' ? '🔴' : r.severity === 'warning' ? '🟡' : '🔵';
    report += `#### ${icon} ${r.route} — ${r.status.replace(/[^\w\s]/g, '').trim()}\n`;
    for (const issue of r.issues) {
      report += `- ${issue}\n`;
    }
    report += `\n`;
  }
} else {
  report += `\n✅ **All routes healthy** — no performance issues detected.\n`;
}

// Output the report to stdout (agent reads this)
console.log(report);

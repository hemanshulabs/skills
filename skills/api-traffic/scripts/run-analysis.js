#!/usr/bin/env node

/**
 * TrafficLens — Run autocannon against discovered routes and analyze results.
 * 
 * Usage: node run-analysis.js <routes_json_file_or_stdin> [--base-url http://localhost:3000] [--connections 10] [--duration 10]
 * 
 * Input: JSON with { routes: [{ method, path }] }
 * Output: Structured markdown report with findings
 */

import { execSync } from 'node:child_process';

// Parse CLI args
const args = process.argv.slice(2);
let baseUrl = 'http://localhost:3000';
let connections = 10;
let duration = 10;
let inputFile = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--base-url' && args[i + 1]) { baseUrl = args[++i]; }
  else if (args[i] === '--connections' && args[i + 1]) { connections = parseInt(args[++i]); }
  else if (args[i] === '--duration' && args[i + 1]) { duration = parseInt(args[++i]); }
  else if (!args[i].startsWith('--')) { inputFile = args[i]; }
}

// Read routes from file or stdin
let routesData;
if (inputFile) {
  const { readFileSync } = await import('node:fs');
  routesData = JSON.parse(readFileSync(inputFile, 'utf-8'));
} else {
  // Read from stdin
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  routesData = JSON.parse(Buffer.concat(chunks).toString());
}

const routes = routesData.routes || routesData;

// Ensure autocannon is available
try {
  execSync('npx autocannon --version', { stdio: 'ignore' });
} catch {
  console.error('autocannon not found. Installing...');
  execSync('npm install -g autocannon', { stdio: 'inherit' });
}

// Thresholds
const THRESHOLDS = {
  p95_critical: 500,   // ms
  p95_warning: 200,    // ms
  error_rate_critical: 0.10,
  error_rate_warning: 0.05,
};

/**
 * Run autocannon against a single route
 */
function runRoute(route) {
  const url = `${baseUrl}${route.path}`;
  const method = (route.method || 'GET').toUpperCase();
  
  let cmd = `npx autocannon -c ${connections} -d ${duration} --json`;
  
  if (method !== 'GET') {
    cmd += ` -m ${method}`;
    cmd += ` -H "content-type: application/json"`;
    // Provide a minimal body for write methods
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      cmd += ` -b '${JSON.stringify({ test: true })}'`;
    }
  }
  
  cmd += ` "${url}"`;

  try {
    const output = execSync(cmd, { 
      encoding: 'utf-8', 
      timeout: (duration + 15) * 1000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return JSON.parse(output);
  } catch (err) {
    return { error: err.message, route };
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
      errors: 0, timeouts: 0,
      issues: [`Connection failed: ${result.error}`],
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

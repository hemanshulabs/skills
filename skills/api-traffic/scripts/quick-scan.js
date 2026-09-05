#!/usr/bin/env node

/**
 * TrafficLens Engine: Automated API Route Discovery & AutoCannon Load Testing
 * Designed for Agent Skills (Claude Code, Cursor, Codex, Gemini CLI, OpenCode)
 * 
 * Flow:
 * 1. Verifies / installs autocannon
 * 2. Scans project workspace to discover API routes (Express, Fastify, Next.js, NestJS, Hono, Koa)
 * 3. Detects active local server port (native fetch ping)
 * 4. Runs controlled autocannon benchmark
 * 5. Emits concise, high-density operational telemetry & diagnostics
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { execSync } from 'node:child_process';

// ── Argument Parsing ──
const args = process.argv.slice(2);
let targetBaseUrl = null;
let projectRoot = process.cwd();
let connections = 10;
let duration = 10;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--base-url' && args[i + 1]) targetBaseUrl = args[++i];
  else if (args[i] === '--project' && args[i + 1]) projectRoot = args[++i];
  else if (args[i] === '--connections' && args[i + 1]) connections = parseInt(args[++i], 10);
  else if (args[i] === '--duration' && args[i + 1]) duration = parseInt(args[++i], 10);
}

// ── Step 1: Ensure AutoCannon is Installed ──
function ensureAutoCannon() {
  try {
    execSync('npx autocannon --version', { stdio: 'ignore', timeout: 8000 });
  } catch {
    console.error('⚙️ [TrafficLens] AutoCannon not detected. Installing globally...');
    try {
      execSync('npm install -g autocannon', { stdio: 'inherit', timeout: 60000 });
    } catch {
      console.error('⚙️ [TrafficLens] Global install failed. Installing as local dev dependency...');
      try {
        execSync('npm install --save-dev autocannon', { cwd: projectRoot, stdio: 'inherit', timeout: 60000 });
      } catch (err) {
        console.error(`❌ Failed to install autocannon: ${err.message}`);
        process.exit(1);
      }
    }
  }
}

// ── Step 2: Discover API Routes ──
const SKIP_DIRS = new Set(['node_modules', '.next', '.nuxt', 'dist', 'build', '.git', 'coverage', '__tests__', '.turbo']);
const CODE_EXTS = new Set(['.ts', '.js', '.tsx', '.jsx', '.mts', '.mjs']);

const ROUTE_REGEXES = [
  // Express / Koa / Fastify / Hono: app.get('/...', ...), router.post('/...', ...)
  /(?:app|router|server|fastify|instance|hono|route)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  // NestJS Decorators: @Get('/...'), @Post('...')
  /@(Get|Post|Put|Patch|Delete)\s*\(\s*['"`]([^'"`]*)['"`]\s*\)/gi,
  // NestJS Decorators without path: @Get()
  /@(Get|Post|Put|Patch|Delete)\s*\(\s*\)/gi,
];

function walkFiles(dir, depth = 0) {
  if (depth > 6) return [];
  const files = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          files.push(...walkFiles(fullPath, depth + 1));
        } else if (CODE_EXTS.has(extname(entry))) {
          files.push(fullPath);
        }
      } catch {}
    }
  } catch {}
  return files;
}

function discoverRoutes() {
  const routes = [];
  const seen = new Set();
  const allFiles = walkFiles(projectRoot);

  // 1. First pass: detect router imports and mount prefixes
  const fileMountPrefixes = new Map(); // normalizedFilePath -> prefix
  const varToFile = new Map();         // varName -> normalizedFilePath

  for (const file of allFiles) {
    let content = '';
    try { content = readFileSync(file, 'utf-8'); } catch { continue; }

    // Match imports: import productsRouter from './routes/products.js'
    const importRe = /import\s+([a-zA-Z0-9_]+)\s+from\s+['"`]([^'"`]+)['"`]/g;
    let im;
    while ((im = importRe.exec(content)) !== null) {
      const varName = im[1];
      const relImport = im[2];
      // Resolve relative path roughly
      const cleanRel = relImport.replace(/^\.\//, '').replace(/\.(js|ts)$/, '');
      varToFile.set(varName, cleanRel);
    }

    // Match mounts: app.use('/api/products', productsRouter)
    const mountRe = /(?:app|server|router)\.use\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([a-zA-Z0-9_]+)\s*\)/g;
    let mm;
    while ((mm = mountRe.exec(content)) !== null) {
      const prefix = mm[1];
      const routerVar = mm[2];
      const targetRel = varToFile.get(routerVar);
      if (targetRel) {
        fileMountPrefixes.set(targetRel, prefix);
      }
    }
  }

  // 2. Second pass: extract route definitions and apply mount prefix if applicable
  for (const file of allFiles) {
    let content = '';
    try { content = readFileSync(file, 'utf-8'); } catch { continue; }

    const normFile = relative(projectRoot, file).replace(/\\/g, '/').replace(/\.(js|ts|tsx|jsx)$/, '');
    // Find if this file has a mount prefix
    let prefix = '';
    for (const [targetKey, mountPrefix] of fileMountPrefixes.entries()) {
      if (normFile.endsWith(targetKey) || normFile.includes(targetKey)) {
        prefix = mountPrefix;
        break;
      }
    }

    for (const re of ROUTE_REGEXES) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        let subPath = match[2] || '/';
        const line = content.substring(0, match.index).split('\n').length;

        // Combine prefix + subPath
        let fullPath = subPath;
        if (prefix) {
          if (subPath === '/' || !subPath) {
            fullPath = prefix;
          } else {
            fullPath = prefix + (subPath.startsWith('/') ? subPath : '/' + subPath);
          }
        }

        if (fullPath.startsWith('/') && !fullPath.includes('*')) {
          const key = `${method}:${fullPath}`;
          if (!seen.has(key)) {
            seen.add(key);
            routes.push({ method, path: fullPath, file: relative(projectRoot, file), line });
          }
        }
      }
    }
  }

  // 2. File-based routing (Next.js App / Pages router)
  const fileRouteRoots = ['pages/api', 'app/api', 'src/pages/api', 'src/app/api', 'server/api'];
  for (const relDir of fileRouteRoots) {
    const fullDir = join(projectRoot, relDir);
    if (!existsSync(fullDir)) continue;

    for (const file of walkFiles(fullDir)) {
      let routePath = '/' + relative(fullDir, file)
        .replace(/\\/g, '/')
        .replace(/\.(ts|js|tsx|jsx)$/, '')
        .replace(/\/index$/, '')
        .replace(/\/route$/, '');
      
      routePath = routePath.replace(/\[([^\]]+)\]/g, ':$1');
      if (!routePath.startsWith('/api')) routePath = '/api' + routePath;

      let content = '';
      try { content = readFileSync(file, 'utf-8'); } catch {}

      const detectedMethods = [];
      if (/export\s+(async\s+)?function\s+GET/i.test(content)) detectedMethods.push('GET');
      if (/export\s+(async\s+)?function\s+POST/i.test(content)) detectedMethods.push('POST');
      if (/export\s+(async\s+)?function\s+PUT/i.test(content)) detectedMethods.push('PUT');
      if (/export\s+(async\s+)?function\s+DELETE/i.test(content)) detectedMethods.push('DELETE');
      if (detectedMethods.length === 0) detectedMethods.push('GET');

      for (const method of detectedMethods) {
        const key = `${method}:${routePath}`;
        if (!seen.has(key)) {
          seen.add(key);
          routes.push({ method, path: routePath, file: relative(projectRoot, file), line: 1 });
        }
      }
    }
  }

  return routes.sort((a, b) => a.path.localeCompare(b.path));
}

// ── Step 3: Detect Active Server Port ──
async function detectActiveServer(candidateUrl) {
  if (candidateUrl) {
    try {
      const res = await fetch(candidateUrl, { signal: AbortSignal.timeout(2000) });
      return candidateUrl;
    } catch {
      return null;
    }
  }

  const commonPorts = [3000, 3001, 8000, 8080, 5000, 4000, 5173];
  for (const port of commonPorts) {
    const testUrl = `http://localhost:${port}`;
    try {
      await fetch(testUrl, { signal: AbortSignal.timeout(1000) });
      return testUrl;
    } catch {}
  }
  return null;
}

// ── Step 4: Run AutoCannon & Analyze ──
function runAutoCannon(baseUrl, route) {
  // Replace dynamic route params (e.g., :id -> 1)
  const resolvedPath = route.path.replace(/:[a-zA-Z0-9_]+/g, '1');
  const target = `${baseUrl}${resolvedPath}`;
  const method = route.method.toUpperCase();

  let cmd = `npx autocannon -c ${connections} -d ${duration} --json`;
  if (method !== 'GET') {
    cmd += ` -m ${method}`;
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const mockBody = JSON.stringify({
        query: 'search query',
        items: [{ id: '1', qty: 1 }],
        paymentMethod: 'card',
        test: true
      });
      // Escape for command line
      const escapedBody = mockBody.replace(/"/g, '\\"');
      cmd += ` -H "content-type: application/json" -b "${escapedBody}"`;
    }
  }
  cmd += ` "${target}"`;

  try {
    const rawOutput = execSync(cmd, {
      encoding: 'utf-8',
      timeout: (duration + 10) * 1000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { ok: true, data: JSON.parse(rawOutput) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Main Execution ──
async function main() {
  ensureAutoCannon();

  const routes = discoverRoutes();
  if (routes.length === 0) {
    console.log(`⚠️ **No API routes found** in \`${projectRoot}\`.\nVerify your backend source files or specify custom endpoints.`);
    process.exit(0);
  }

  const activeServerUrl = await detectActiveServer(targetBaseUrl);
  if (!activeServerUrl) {
    console.log(`❌ **API Server Not Reachable**\n\nNo active server responded on standard ports (3000, 3001, 8000, 8080, 5000, 4000).\n` +
      `**Action needed:** Start your local API server (e.g. \`npm run dev\`), then run \`/api-traffic\`.`);
    process.exit(1);
  }

  console.error(`⚡ [TrafficLens] Found ${routes.length} routes. Testing against ${activeServerUrl} (${connections} conns, ${duration}s each)...`);

  const results = [];
  const SLO_P95_CRITICAL = 500; // ms
  const SLO_P95_WARN = 250;     // ms

  for (const r of routes) {
    console.error(`  Testing ${r.method} ${r.path}...`);
    const res = runAutoCannon(activeServerUrl, r);

    if (!res.ok) {
      results.push({
        method: r.method,
        path: r.path,
        rps: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        errors: 1,
        status: '❌ Fail',
        flag: 'critical',
        note: 'Connection dropped or server refused'
      });
      continue;
    }

    const d = res.data;
    const rps = Math.round(d.requests?.average || 0);
    const p50 = d.latency?.p50 ?? Math.round(d.latency?.average || 0);
    const p95 = d.latency?.p95 ?? d.latency?.p97_5 ?? d.latency?.p90 ?? Math.round(d.latency?.average || 0);
    const p99 = d.latency?.p99 ?? d.latency?.max ?? 0;
    const errCount = (d.errors || 0) + (d.non2xx || 0);
    const totalReq = d.requests?.total || 1;
    const errorRate = errCount / totalReq;

    let flag = 'healthy';
    let status = '✅ Healthy';
    let note = '';

    if (p95 > SLO_P95_CRITICAL) {
      flag = 'critical';
      status = '🔴 Slow';
      note = `p95 ${p95}ms exceeds 500ms SLO (+${Math.round((p95 / SLO_P95_CRITICAL - 1) * 100)}%)`;
    } else if (p95 > SLO_P95_WARN) {
      flag = 'warning';
      status = '🟡 Warning';
      note = `p95 ${p95}ms approaching latency threshold`;
    }

    if (errorRate > 0.05) {
      flag = 'critical';
      status = '🔴 Errors';
      note = `${(errorRate * 100).toFixed(1)}% error rate (${errCount}/${totalReq})`;
    }

    results.push({
      method: r.method,
      path: r.path,
      rps,
      p50,
      p95,
      p99,
      errors: errCount,
      status,
      flag,
      note
    });
  }

  // ── Token-Efficient Formatted Output ──
  const formatMs = (ms) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;

  let out = `## 🚦 TrafficLens API Performance Report\n\n`;
  out += `**Target:** \`${activeServerUrl}\` | **Routes:** ${routes.length} | **Load:** ${connections} conns (${duration}s/route)\n\n`;
  out += `| Route | Method | RPS | p50 | p95 | p99 | Errors | Status |\n`;
  out += `| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

  for (const item of results) {
    out += `| \`${item.path}\` | \`${item.method}\` | ${item.rps.toLocaleString()} | ${formatMs(item.p50)} | ${formatMs(item.p95)} | ${formatMs(item.p99)} | ${item.errors} | ${item.status} |\n`;
  }

  const issues = results.filter(item => item.flag !== 'healthy');
  if (issues.length > 0) {
    out += `\n### ⚠️ Bottlenecks & Fix Recommendations\n\n`;
    for (const iss of issues) {
      const badge = iss.flag === 'critical' ? '🔴' : '🟡';
      out += `* **${badge} \`${iss.method} ${iss.path}\`** — ${iss.note}\n`;
      if (iss.p95 > SLO_P95_CRITICAL) {
        out += `  * *Fix:* Check database indexes, external service wait times, or missing caching.\n`;
      }
      if (iss.errors > 0) {
        out += `  * *Fix:* Inspect unhandled exceptions or validate request payload schema.\n`;
      }
    }
  } else {
    out += `\n✅ **All endpoints healthy.** Latency percentiles and error budgets are within normal targets.\n`;
  }

  console.log(out);
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});

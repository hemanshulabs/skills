#!/usr/bin/env node

/**
 * TrafficLens Route Discovery Script
 * 
 * Scans a Node.js / TypeScript project to find API route definitions.
 * Supports: Express, Fastify, Koa, Next.js, NestJS, Hono, Elysia
 * 
 * Usage: node discover-routes.js <project_root>
 * Output: JSON array of { method, path, file, line } objects
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const projectRoot = process.argv[2] || process.cwd();

/** Route patterns for different frameworks */
const PATTERNS = [
  // Express / Koa: app.get('/path', ...) or router.post('/path', ...)
  /(?:app|router|route|server)\.(get|post|put|patch|delete|all|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  
  // Fastify: fastify.get('/path', ...) or instance.route({ method: 'GET', url: '/path' })
  /(?:fastify|instance|server|app)\.(get|post|put|patch|delete|all|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  
  // Hono: app.get('/path', ...) 
  /(?:app|hono)\.(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi,

  // NestJS decorators: @Get('/path'), @Post('/path')
  /@(Get|Post|Put|Patch|Delete|All|Options|Head)\s*\(\s*['"`]([^'"`]*)['"`]\s*\)/gi,
  
  // NestJS decorators without path: @Get()
  /@(Get|Post|Put|Patch|Delete)\s*\(\s*\)/gi,
];

/** File-based routing patterns (Next.js, Nuxt, SvelteKit) */
const FILE_ROUTE_DIRS = [
  'pages/api',         // Next.js Pages Router
  'app/api',           // Next.js App Router
  'src/pages/api',     // Next.js (src layout)
  'src/app/api',       // Next.js App Router (src layout)
  'server/api',        // Nuxt
  'src/routes/api',    // SvelteKit
  'src/routes',        // Remix
];

/** Dirs and files to skip */
const SKIP = new Set(['node_modules', '.next', '.nuxt', 'dist', 'build', '.git', 'coverage', '__tests__', '__mocks__']);
const EXTENSIONS = new Set(['.ts', '.js', '.tsx', '.jsx', '.mts', '.mjs']);

const routes = [];
const seen = new Set();

/**
 * Walk directory and collect files
 */
function walk(dir, maxDepth = 8, depth = 0) {
  if (depth > maxDepth) return [];
  const files = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (SKIP.has(entry) || entry.startsWith('.')) continue;
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          files.push(...walk(full, maxDepth, depth + 1));
        } else if (EXTENSIONS.has(extname(entry))) {
          files.push(full);
        }
      } catch { /* skip inaccessible */ }
    }
  } catch { /* skip unreadable dirs */ }
  return files;
}

/**
 * Extract routes from source file using regex patterns
 */
function extractRoutes(filePath) {
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch { return; }

  const relPath = relative(projectRoot, filePath);

  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const path = match[2] || '/';
      const lineNum = content.substring(0, match.index).split('\n').length;
      const key = `${method}:${path}`;
      
      if (!seen.has(key) && path.startsWith('/')) {
        seen.add(key);
        routes.push({ method, path, file: relPath, line: lineNum });
      }
    }
  }
}

/**
 * Discover file-based routes (Next.js, Nuxt, etc.)
 */
function discoverFileRoutes() {
  for (const dir of FILE_ROUTE_DIRS) {
    const fullDir = join(projectRoot, dir);
    if (!existsSync(fullDir)) continue;

    const files = walk(fullDir, 4);
    for (const file of files) {
      const rel = relative(fullDir, file);
      // Convert file path to route path
      let routePath = '/' + rel
        .replace(/\\/g, '/')
        .replace(/\.(ts|js|tsx|jsx|mts|mjs)$/, '')
        .replace(/\/index$/, '')
        .replace(/\/route$/, '')        // Next.js App Router
        .replace(/\/\+server$/, '')     // SvelteKit
        .replace(/\.server$/, '');      // Remix
      
      // Convert [param] to :param
      routePath = routePath.replace(/\[([^\]]+)\]/g, ':$1');
      
      // Prefix with /api if not already
      if (!routePath.startsWith('/api')) {
        routePath = '/api' + routePath;
      }

      const content = readFileSync(file, 'utf-8');
      const methods = [];
      
      // Check which HTTP methods are exported
      if (/export\s+(async\s+)?function\s+GET/i.test(content)) methods.push('GET');
      if (/export\s+(async\s+)?function\s+POST/i.test(content)) methods.push('POST');
      if (/export\s+(async\s+)?function\s+PUT/i.test(content)) methods.push('PUT');
      if (/export\s+(async\s+)?function\s+PATCH/i.test(content)) methods.push('PATCH');
      if (/export\s+(async\s+)?function\s+DELETE/i.test(content)) methods.push('DELETE');
      
      // Default export = handles all (common in Pages Router)
      if (methods.length === 0 && /export\s+default/i.test(content)) {
        methods.push('GET');
      }

      for (const method of methods) {
        const key = `${method}:${routePath}`;
        if (!seen.has(key)) {
          seen.add(key);
          routes.push({
            method,
            path: routePath,
            file: relative(projectRoot, file),
            line: 1,
          });
        }
      }
    }
  }
}

/**
 * Look at package.json to detect framework
 */
function detectFramework() {
  try {
    const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const frameworks = [];
    if (allDeps['express']) frameworks.push('express');
    if (allDeps['fastify']) frameworks.push('fastify');
    if (allDeps['@nestjs/core']) frameworks.push('nestjs');
    if (allDeps['next']) frameworks.push('nextjs');
    if (allDeps['nuxt'] || allDeps['nuxt3']) frameworks.push('nuxt');
    if (allDeps['hono']) frameworks.push('hono');
    if (allDeps['elysia']) frameworks.push('elysia');
    if (allDeps['koa']) frameworks.push('koa');
    return frameworks;
  } catch {
    return [];
  }
}

// Run discovery
const frameworks = detectFramework();
const sourceFiles = walk(projectRoot);

for (const file of sourceFiles) {
  extractRoutes(file);
}

discoverFileRoutes();

// Sort: GET first, then by path
routes.sort((a, b) => {
  const methodOrder = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };
  const ma = methodOrder[a.method] ?? 5;
  const mb = methodOrder[b.method] ?? 5;
  if (ma !== mb) return ma - mb;
  return a.path.localeCompare(b.path);
});

// Output
const output = {
  project: projectRoot,
  frameworks,
  routes,
  count: routes.length,
};

console.log(JSON.stringify(output, null, 2));

/**
 * AST & Pattern-based Route Scanner for Glintbase Agent Harness.
 * Extracts API endpoints, HTTP methods, route parameters, and docstrings
 * across Next.js (App & Pages Router), Express, and FastAPI.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve, sep } from 'path';
import ts from 'typescript';
import { detectFramework, FrameworkProfile } from './frameworkDetector.js';

export interface DiscoveredRoute {
  path: string;
  method: string;
  file: string;
  description?: string;
  parameters?: Array<{
    name: string;
    in: 'path' | 'query' | 'body';
    required?: boolean;
    type?: string;
  }>;
  framework: string;
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.venv',
  'venv',
  '__pycache__',
  '.cache',
]);

/**
 * Recursively find files matching extensions while skipping common build/dependency directories.
 */
function findFiles(dir: string, extensions: string[], maxDepth: number = 8, currentDepth: number = 0): string[] {
  if (!existsSync(dir) || currentDepth > maxDepth) return [];
  const results: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        results.push(...findFiles(fullPath, extensions, maxDepth, currentDepth + 1));
      } else if (entry.isFile()) {
        if (extensions.some(ext => entry.name.endsWith(ext))) {
          results.push(fullPath);
        }
      }
    }
  } catch {
    /* ignore unreadable dirs */
  }

  return results;
}

/**
 * Extract path parameters from route segment string (e.g. `[id]` -> `id`, `[...slug]` -> `slug`).
 */
function extractPathParameters(routePath: string): Array<{ name: string; in: 'path'; required: boolean }> {
  const params: Array<{ name: string; in: 'path'; required: boolean }> = [];
  const matches = routePath.match(/\[([^\]]+)\]/g);
  if (matches) {
    for (const match of matches) {
      const raw = match.slice(1, -1);
      const name = raw.startsWith('...') ? raw.slice(3) : raw;
      params.push({
        name,
        in: 'path',
        required: !raw.startsWith('...'),
      });
    }
  }
  return params;
}

/**
 * Extract leading JSDoc / comments from a TypeScript AST node.
 */
function extractLeadingComments(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  const fullText = sourceFile.getFullText();
  const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
  if (!ranges || ranges.length === 0) return undefined;

  const comments = ranges
    .map(r => fullText.slice(r.pos, r.end))
    .join('\n')
    .replace(/\/\*\*|\*\/|\*/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join(' ');

  return comments || undefined;
}

/**
 * Scan Next.js App Router (app/api/.../route.ts or app/.../route.ts).
 */
export function scanNextAppRoutes(cwd: string): DiscoveredRoute[] {
  const appCandidates = [
    join(cwd, 'src', 'app'),
    join(cwd, 'app'),
  ].filter(p => existsSync(p));

  const routes: DiscoveredRoute[] = [];
  const httpMethods = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

  for (const appDir of appCandidates) {
    const routeFiles = findFiles(appDir, ['route.ts', 'route.js', 'route.tsx', 'route.jsx']);

    for (const file of routeFiles) {
      const relPath = relative(appDir, file).replace(/\\/g, '/');
      // Convert e.g. "api/users/[id]/route.ts" -> "/api/users/[id]"
      const routeDir = relPath.replace(/\/route\.[a-z]+$/, '');
      const path = '/' + routeDir.replace(/^\/+/, '');
      const pathParams = extractPathParameters(path);

      try {
        const content = readFileSync(file, 'utf-8');
        const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);

        const exportedMethods = new Map<string, string | undefined>();

        ts.forEachChild(sourceFile, node => {
          // 1. Function declaration: export async function GET(req: Request) ...
          if (ts.isFunctionDeclaration(node) && node.name) {
            const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
            const fnName = node.name.text.toUpperCase();
            if (isExported && httpMethods.has(fnName)) {
              const doc = extractLeadingComments(node, sourceFile);
              exportedMethods.set(fnName, doc);
            }
          }

          // 2. Variable statement: export const POST = async (req) => ...
          if (ts.isVariableStatement(node)) {
            const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
            if (isExported) {
              for (const decl of node.declarationList.declarations) {
                if (ts.isIdentifier(decl.name)) {
                  const varName = decl.name.text.toUpperCase();
                  if (httpMethods.has(varName)) {
                    const doc = extractLeadingComments(node, sourceFile);
                    exportedMethods.set(varName, doc);
                  }
                }
              }
            }
          }
        });

        // If no named export found, fallback to 'ALL'
        if (exportedMethods.size === 0) {
          routes.push({
            path,
            method: 'ALL',
            file: relative(cwd, file).replace(/\\/g, '/'),
            parameters: pathParams.length > 0 ? pathParams : undefined,
            framework: 'next-app-router',
          });
        } else {
          for (const [method, description] of exportedMethods.entries()) {
            routes.push({
              path,
              method,
              file: relative(cwd, file).replace(/\\/g, '/'),
              description,
              parameters: pathParams.length > 0 ? pathParams : undefined,
              framework: 'next-app-router',
            });
          }
        }
      } catch {
        /* skip parse failure */
      }
    }
  }

  return routes;
}

/**
 * Scan Next.js Pages Router (pages/api/... files).
 */
export function scanNextPagesRoutes(cwd: string): DiscoveredRoute[] {
  const pagesCandidates = [
    join(cwd, 'src', 'pages', 'api'),
    join(cwd, 'pages', 'api'),
  ].filter(p => existsSync(p));

  const routes: DiscoveredRoute[] = [];

  for (const apiDir of pagesCandidates) {
    const files = findFiles(apiDir, ['.ts', '.js', '.tsx', '.jsx']);

    for (const file of files) {
      const relPath = relative(apiDir, file).replace(/\\/g, '/');
      const cleanPath = relPath.replace(/\.[a-z]+$/, '').replace(/\/index$/, '');
      const path = '/api/' + cleanPath.replace(/^\/+/, '');
      const pathParams = extractPathParameters(path);

      try {
        const content = readFileSync(file, 'utf-8');
        // Inspect content to detect specific methods handled: e.g. req.method === 'POST'
        const handledMethods = new Set<string>();
        const methodMatches = content.matchAll(/req\.method\s*===?\s*['"]([A-Z]+)['"]/g);
        for (const match of methodMatches) {
          handledMethods.add(match[1]);
        }

        if (handledMethods.size > 0) {
          for (const method of handledMethods) {
            routes.push({
              path,
              method,
              file: relative(cwd, file).replace(/\\/g, '/'),
              parameters: pathParams.length > 0 ? pathParams : undefined,
              framework: 'next-pages-router',
            });
          }
        } else {
          routes.push({
            path,
            method: 'ALL',
            file: relative(cwd, file).replace(/\\/g, '/'),
            parameters: pathParams.length > 0 ? pathParams : undefined,
            framework: 'next-pages-router',
          });
        }
      } catch {
        /* skip parse failure */
      }
    }
  }

  return routes;
}

/**
 * Scan Express / Koa routes via AST and regex patterns.
 */
export function scanExpressRoutes(cwd: string): DiscoveredRoute[] {
  const searchDirs = [
    join(cwd, 'routes'),
    join(cwd, 'src', 'routes'),
    join(cwd, 'src', 'api'),
    join(cwd, 'src'),
    cwd,
  ].filter(p => existsSync(p));

  const candidateFiles = new Set<string>();
  for (const dir of searchDirs) {
    const files = findFiles(dir, ['.ts', '.js'], dir === cwd ? 1 : 4);
    for (const f of files) candidateFiles.add(f);
  }

  const routes: DiscoveredRoute[] = [];
  const expressMethods = new Set(['get', 'post', 'put', 'delete', 'patch', 'all', 'use']);

  for (const file of candidateFiles) {
    try {
      const content = readFileSync(file, 'utf-8');
      if (!content.includes('express') && !content.includes('router') && !content.includes('Router')) {
        continue;
      }

      const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);

      function visit(node: ts.Node) {
        if (ts.isCallExpression(node)) {
          const expr = node.expression;
          if (ts.isPropertyAccessExpression(expr)) {
            const methodName = expr.name.text.toLowerCase();
            if (expressMethods.has(methodName) && node.arguments.length > 0) {
              const firstArg = node.arguments[0];
              if (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg)) {
                const routePath = firstArg.text;
                if (routePath.startsWith('/')) {
                  routes.push({
                    path: routePath,
                    method: methodName.toUpperCase(),
                    file: relative(cwd, file).replace(/\\/g, '/'),
                    description: extractLeadingComments(node, sourceFile),
                    framework: 'express',
                  });
                }
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
    } catch {
      /* skip */
    }
  }

  return routes;
}

/**
 * Scan FastAPI / Flask Python routes via regex heuristics.
 */
export function scanPythonRoutes(cwd: string): DiscoveredRoute[] {
  const pyFiles = findFiles(cwd, ['.py'], 6);
  const routes: DiscoveredRoute[] = [];

  // Match @app.get("/path"), @router.post('/path'), @api_router.delete("...")
  const routeRegex = /@(?:app|router|api_router|blueprint)\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/gi;
  // Match Flask @app.route("/path", methods=["GET", "POST"])
  const flaskRegex = /@(?:app|blueprint)\.route\(\s*['"]([^'"]+)['"](?:.*methods=\[([^\]]+)\])?/gi;

  for (const file of pyFiles) {
    try {
      const content = readFileSync(file, 'utf-8');
      let match: RegExpExecArray | null;

      while ((match = routeRegex.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        const path = match[2];
        routes.push({
          path,
          method,
          file: relative(cwd, file).replace(/\\/g, '/'),
          framework: 'fastapi',
        });
      }

      while ((match = flaskRegex.exec(content)) !== null) {
        const path = match[1];
        const methodsRaw = match[2];
        if (methodsRaw) {
          const methods = methodsRaw.split(',').map(m => m.trim().replace(/['"]/g, '').toUpperCase());
          for (const method of methods) {
            routes.push({
              path,
              method,
              file: relative(cwd, file).replace(/\\/g, '/'),
              framework: 'flask',
            });
          }
        } else {
          routes.push({
            path,
            method: 'GET',
            file: relative(cwd, file).replace(/\\/g, '/'),
            framework: 'flask',
          });
        }
      }
    } catch {
      /* skip */
    }
  }

  return routes;
}

/**
 * Master Route Scanner. Scans the workspace and detects API routes based on framework profile.
 */
export function scanRoutes(cwd: string = process.cwd(), profile?: FrameworkProfile): DiscoveredRoute[] {
  const activeProfile = profile || detectFramework(cwd);
  const allRoutes: DiscoveredRoute[] = [];

  if (activeProfile.hasAppRouter) {
    allRoutes.push(...scanNextAppRoutes(cwd));
  }

  if (activeProfile.hasPagesRouter) {
    allRoutes.push(...scanNextPagesRoutes(cwd));
  }

  if (activeProfile.framework === 'express' || activeProfile.framework === 'generic-node') {
    allRoutes.push(...scanExpressRoutes(cwd));
  }

  if (activeProfile.framework === 'fastapi' || activeProfile.framework === 'django') {
    allRoutes.push(...scanPythonRoutes(cwd));
  }

  // If no routes detected yet with framework-specific heuristics, try scanning all common patterns
  if (allRoutes.length === 0) {
    allRoutes.push(...scanNextAppRoutes(cwd));
    allRoutes.push(...scanNextPagesRoutes(cwd));
    allRoutes.push(...scanExpressRoutes(cwd));
    allRoutes.push(...scanPythonRoutes(cwd));
  }

  // Deduplicate by path + method
  const seen = new Set<string>();
  const uniqueRoutes: DiscoveredRoute[] = [];

  for (const r of allRoutes) {
    const key = `${r.method}:${r.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRoutes.push(r);
    }
  }

  // Sort routes logically: alphabetical by path, then method
  return uniqueRoutes.sort((a, b) => {
    const pathCmp = a.path.localeCompare(b.path);
    if (pathCmp !== 0) return pathCmp;
    return a.method.localeCompare(b.method);
  });
}

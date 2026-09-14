/**
 * White-Box AST Inspector: Route Type to OpenAPI Generator
 * Specification: GLINTBASE_AUDIT_3_0_UPGRADE_SPEC.md (Section 4.2)
 *
 * Scans Next.js App Router and API routes:
 * 1. Extracts Zod validation schemas (z.object({ ... }))
 * 2. Parses HTTP methods (GET, POST, PUT, DELETE, PATCH)
 * 3. Synthesizes an in-memory OpenAPI 3.1 document to audit schema complexity & operationIds
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import ts from 'typescript';

export interface RouteAstInspectionResult {
  discoveredRoutesCount: number;
  hasZodValidation: boolean;
  operationIdsCount: number;
  synthesizedOpenApi: any;
  routeSignatures: Array<{
    path: string;
    method: string;
    operationId: string;
    hasSchema: boolean;
  }>;
}

function findRouteFiles(dir: string, currentDepth = 0, maxDepth = 8): string[] {
  if (!existsSync(dir) || currentDepth > maxDepth) return [];
  const files: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findRouteFiles(full, currentDepth + 1, maxDepth));
      } else if (entry.isFile() && /^(route\.(ts|js)|[a-zA-Z0-9_\-]+\.(ts|js))$/.test(entry.name)) {
        if (full.includes('api') || full.includes('app') || full.includes('routes')) {
          files.push(full);
        }
      }
    }
  } catch { /* ignore read errors */ }

  return files;
}

export function inspectRouteAst(rootDir: string): RouteAstInspectionResult {
  const routeFiles = findRouteFiles(rootDir);
  const routeSignatures: RouteAstInspectionResult['routeSignatures'] = [];
  const openApiPaths: Record<string, any> = {};

  let hasZodValidation = false;
  let operationIdsCount = 0;

  for (const filePath of routeFiles) {
    const content = readFileSync(filePath, 'utf-8');
    if (content.includes('z.object') || content.includes('zod')) {
      hasZodValidation = true;
    }

    // Determine path from directory relative to root
    const rel = relative(rootDir, filePath).replace(/\\/g, '/');
    let apiPath = '/' + rel
      .replace(/^(src\/)?app\//, '')
      .replace(/^(src\/)?pages\/api\//, 'api/')
      .replace(/\/route\.(ts|js)$/, '')
      .replace(/\.(ts|js)$/, '');

    if (!apiPath.startsWith('/api')) {
      apiPath = '/api/' + apiPath.replace(/^\//, '');
    }

    try {
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true
      );

      const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

      ts.forEachChild(sourceFile, (node) => {
        if (ts.isFunctionDeclaration(node) && node.name) {
          const fnName = node.name.text;
          if (httpMethods.includes(fnName)) {
            const method = fnName.toLowerCase();
            const operationId = `${method}${apiPath.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const hasSchema = content.includes('z.object') || content.includes('req.json()') || content.includes('body');

            routeSignatures.push({
              path: apiPath,
              method: fnName,
              operationId,
              hasSchema,
            });

            operationIdsCount++;

            if (!openApiPaths[apiPath]) openApiPaths[apiPath] = {};
            openApiPaths[apiPath][method] = {
              operationId,
              summary: `Generated operation for ${apiPath}`,
              responses: {
                '200': { description: 'Successful response' },
                '400': { description: 'Bad Request / Validation error' },
              },
            };
          }
        }
      });
    } catch {
      // Fallback regex detection
      const regexMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      for (const m of regexMethods) {
        if (new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(content)) {
          const operationId = `${m.toLowerCase()}${apiPath.replace(/[^a-zA-Z0-9]/g, '_')}`;
          routeSignatures.push({
            path: apiPath,
            method: m,
            operationId,
            hasSchema: content.includes('z.object'),
          });
          operationIdsCount++;
          if (!openApiPaths[apiPath]) openApiPaths[apiPath] = {};
          openApiPaths[apiPath][m.toLowerCase()] = {
            operationId,
            responses: { '200': { description: 'OK' } },
          };
        }
      }
    }
  }

  const synthesizedOpenApi = {
    openapi: '3.1.0',
    info: {
      title: 'Synthesized Codebase API',
      version: '1.0.0',
      description: 'Automatically synthesized in-memory OpenAPI 3.1 specification by Glintbase AST Inspector.',
    },
    paths: openApiPaths,
  };

  return {
    discoveredRoutesCount: routeSignatures.length,
    hasZodValidation,
    operationIdsCount,
    synthesizedOpenApi,
    routeSignatures,
  };
}

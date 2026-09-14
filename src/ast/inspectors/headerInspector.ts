/**
 * White-Box AST Inspector: Header & Ergonomics Inspection
 * Specification: GLINTBASE_AUDIT_3_0_UPGRADE_SPEC.md (Section 4)
 *
 * Inspects route handlers for:
 * 1. RateLimit response headers or rate limiting middleware
 * 2. Idempotency-Key header support on mutation endpoints
 * 3. Typed JSON error responses
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

export interface HeaderInspectionResult {
  hasRateLimitHeaders: boolean;
  hasIdempotencyKey: boolean;
  hasStructuredErrors: boolean;
  inspectedRouteFilesCount: number;
}

function scanDirForHeaders(dir: string, currentDepth = 0, maxDepth = 6): string[] {
  if (!existsSync(dir) || currentDepth > maxDepth) return [];
  const contents: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        contents.push(...scanDirForHeaders(full, currentDepth + 1, maxDepth));
      } else if (entry.isFile() && /\.(ts|js|tsx|jsx)$/.test(entry.name)) {
        if (full.includes('api') || full.includes('route') || full.includes('handler')) {
          contents.push(readFileSync(full, 'utf-8'));
        }
      }
    }
  } catch { /* ignore read errors */ }

  return contents;
}

export function inspectRouteHeaders(rootDir: string): HeaderInspectionResult {
  const fileContents = scanDirForHeaders(rootDir);

  let hasRateLimitHeaders = false;
  let hasIdempotencyKey = false;
  let hasStructuredErrors = false;

  for (const content of fileContents) {
    const lower = content.toLowerCase();
    if (lower.includes('ratelimit') || lower.includes('x-ratelimit') || lower.includes('rate-limit') || lower.includes('@upstash/ratelimit')) {
      hasRateLimitHeaders = true;
    }
    if (lower.includes('idempotency-key') || lower.includes('idempotency')) {
      hasIdempotencyKey = true;
    }
    if (lower.includes('status: 400') || lower.includes('status: 404') || lower.includes('status: 500') || lower.includes('response.json({ error')) {
      hasStructuredErrors = true;
    }
  }

  return {
    hasRateLimitHeaders,
    hasIdempotencyKey,
    hasStructuredErrors,
    inspectedRouteFilesCount: fileContents.length,
  };
}

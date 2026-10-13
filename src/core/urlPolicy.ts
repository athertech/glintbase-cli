/**
 * CLI audit-target resolution.
 * URL validation (SSRF guards) comes from the shared ARS engine: validateScanUrl in
 * @glintbase/scanner-core, the same policy scan.glintbase.dev applies.
 */

import { existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { validateScanUrl } from '@glintbase/scanner-core';

export { validateScanUrl };
export type { UrlPolicyCode, UrlPolicyResult } from '@glintbase/scanner-core';

/**
 * Normalizes a URL string the engine policy refused (e.g. a localhost dev server):
 * the target is still reported as a URL so callers can explain why it cannot be
 * probed, instead of silently treating it as a directory.
 */
function normalizeUnvalidated(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

export interface ResolvedAuditTarget {
  isUrl: boolean;
  target: string;
  normalizedUrl?: string;
}

/**
 * Intelligently classifies target into a local codebase directory or a network URL.
 * Handles:
 * - Empty, '.', 'codebase' -> current directory
 * - 'localhost:3000', '127.0.0.1:8080' -> http://localhost:3000
 * - 'glintbase.dev', 'api.github.com' -> https://glintbase.dev
 * - 'http://...' / 'https://...' -> validated URL
 * - Existing filesystem directory -> absolute path
 */
export function resolveAuditTarget(input: string = '.'): ResolvedAuditTarget {
  const trimmed = (input || '').trim();

  // 1. Explicit codebase / directory shortcuts
  if (!trimmed || trimmed === '.' || trimmed.toLowerCase() === 'codebase') {
    return { isUrl: false, target: process.cwd() };
  }

  // 2. Explicit HTTP/HTTPS scheme
  if (/^https?:\/\//i.test(trimmed)) {
    const policy = validateScanUrl(trimmed, { allowHttp: true });
    const finalUrl = policy.ok && policy.url ? policy.url : normalizeUnvalidated(trimmed);
    return { isUrl: true, target: finalUrl, normalizedUrl: finalUrl };
  }

  // 3. Localhost or Loopback IP with optional port
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)(:\d+)?(\/.*)?$/i.test(trimmed)) {
    const withHttp = `http://${trimmed}`;
    const policy = validateScanUrl(withHttp, { allowHttp: true });
    const finalUrl = policy.ok && policy.url ? policy.url : normalizeUnvalidated(withHttp);
    return { isUrl: true, target: finalUrl, normalizedUrl: finalUrl };
  }

  // 4. If directory exists on disk, treat as local codebase
  try {
    const absPath = resolve(process.cwd(), trimmed);
    if (existsSync(absPath) && statSync(absPath).isDirectory()) {
      return { isUrl: false, target: absPath };
    }
  } catch {
    // Filesystem error fallback
  }

  // 5. Bare domain with TLD (e.g. glintbase.dev, stripe.com, sub.domain.co.uk)
  if (/^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/i.test(trimmed)) {
    const withHttps = `https://${trimmed}`;
    const policy = validateScanUrl(withHttps, { allowHttp: true });
    const finalUrl = policy.ok && policy.url ? policy.url : normalizeUnvalidated(withHttps);
    return { isUrl: true, target: finalUrl, normalizedUrl: finalUrl };
  }

  // Default: treat as local path
  return { isUrl: false, target: resolve(process.cwd(), trimmed) };
}

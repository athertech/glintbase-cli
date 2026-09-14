/**
 * URL policy + SSRF guards.
 * Pure checks — no network DNS resolution (IP literals + hostname patterns).
 */

import { existsSync, statSync } from 'fs';
import { resolve } from 'path';

export type UrlPolicyCode =
  | 'OK'
  | 'EMPTY'
  | 'INVALID_URL'
  | 'SCHEME_NOT_ALLOWED'
  | 'CREDENTIALS_FORBIDDEN'
  | 'SSRF_BLOCKED'
  | 'PORT_NOT_ALLOWED';

export interface UrlPolicyResult {
  ok: boolean;
  code: UrlPolicyCode;
  message?: string;
  url?: string;
}

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata',
  '0.0.0.0',
]);

function isPrivateIPv4(host: string, allowLocal: boolean): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return false;
  const [a, b] = parts;
  if (a === 127) return !allowLocal; // loopback
  if (a === 10) return !allowLocal;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return !allowLocal;
  if (a === 192 && b === 168) return !allowLocal;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  return false;
}

function isBlockedHostname(hostname: string, allowLocal: boolean): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || h.endsWith('.localhost')) {
    return !allowLocal;
  }
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith('.internal')) return true;
  if (h === 'metadata.google.internal') return true;
  if (h === '[::1]' || h === '::1') return !allowLocal;
  if (isPrivateIPv4(h, allowLocal)) return true;
  return false;
}

function allowedPort(protocol: string, port: string, allowLocal: boolean): boolean {
  if (!port) return true;
  const p = Number(port);
  if (protocol === 'https:' && (p === 443 || p === 8443)) return true;
  if (protocol === 'http:' && (p === 80 || p === 8080)) return true;
  if (allowLocal && p >= 1024 && p <= 65535) return true; // Allow dev server ports (3000, 5173, 8000, etc.)
  return false;
}

export function validateScanUrl(
  input: string,
  opts: { allowHttp?: boolean; allowLocalhost?: boolean } = {}
): UrlPolicyResult {
  const raw = (input || '').trim();
  if (!raw) {
    return { ok: false, code: 'EMPTY', message: 'URL is required' };
  }

  const allowLocal = opts.allowLocalhost ?? true;
  const allowHttp = opts.allowHttp ?? true;

  let withScheme = raw;
  if (!/^https?:\/\//i.test(withScheme)) {
    const isLocalTarget = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)(:\d+)?(\/.*)?$/i.test(raw);
    withScheme = isLocalTarget ? `http://${raw}` : `https://${raw}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, code: 'INVALID_URL', message: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      ok: false,
      code: 'SCHEME_NOT_ALLOWED',
      message: 'Only http and https URLs are allowed',
    };
  }

  if (parsed.protocol === 'http:' && !allowHttp) {
    return {
      ok: false,
      code: 'SCHEME_NOT_ALLOWED',
      message: 'HTTPS is required in production',
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      code: 'CREDENTIALS_FORBIDDEN',
      message: 'URLs with embedded credentials are not allowed',
    };
  }

  if (!parsed.hostname) {
    return { ok: false, code: 'INVALID_URL', message: 'Hostname is required' };
  }

  if (isBlockedHostname(parsed.hostname, allowLocal)) {
    return {
      ok: false,
      code: 'SSRF_BLOCKED',
      message: 'Target host is blocked (private, loopback, or metadata address)',
    };
  }

  if (!allowedPort(parsed.protocol, parsed.port, allowLocal)) {
    return {
      ok: false,
      code: 'PORT_NOT_ALLOWED',
      message: 'Only standard HTTP/HTTPS or local dev ports are allowed',
    };
  }

  parsed.hash = '';
  return { ok: true, code: 'OK', url: parsed.toString() };
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
    const policy = validateScanUrl(trimmed, { allowHttp: true, allowLocalhost: true });
    const finalUrl = policy.ok && policy.url ? policy.url : trimmed;
    return { isUrl: true, target: finalUrl, normalizedUrl: finalUrl };
  }

  // 3. Localhost or Loopback IP with optional port
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)(:\d+)?(\/.*)?$/i.test(trimmed)) {
    const withHttp = `http://${trimmed}`;
    const policy = validateScanUrl(withHttp, { allowHttp: true, allowLocalhost: true });
    const finalUrl = policy.ok && policy.url ? policy.url : withHttp;
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
    const policy = validateScanUrl(withHttps, { allowHttp: true, allowLocalhost: true });
    const finalUrl = policy.ok && policy.url ? policy.url : withHttps;
    return { isUrl: true, target: finalUrl, normalizedUrl: finalUrl };
  }

  // Default: treat as local path
  return { isUrl: false, target: resolve(process.cwd(), trimmed) };
}

/**
 * Centralized resource fetch with size caps, timeouts, and soft status taxonomy.
 */

import { validateScanUrl } from './urlPolicy.js';

export type FetchStatus =
  | 'ok'
  | 'unreachable'
  | 'timeout'
  | 'blocked'
  | 'soft_404'
  | 'empty'
  | 'too_large'
  | 'failed';

export interface FetchResourceOptions {
  timeoutMs?: number;
  maxBytes?: number;
  method?: 'GET' | 'HEAD' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  probeOnly?: boolean;
  retries?: number;
  /** When true, reads the response body even for HTTP 4xx/5xx status codes */
  allowErrorBody?: boolean;
}

export interface FetchResourceResult {
  ok: boolean;
  status: FetchStatus;
  httpStatus?: number;
  body?: string;
  contentType?: string | null;
  headers?: Record<string, string>;
  url: string;
  finalUrl?: string;
  bytes?: number;
  networkError?: boolean;
  error?: string;
}

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DEFAULT_TIMEOUT = 5000;
const DEFAULT_MAX_BYTES = 2_000_000;

function looksLikeSoft404(body: string, httpStatus: number): boolean {
  if (httpStatus === 404) return true;
  // Only evaluate HTML documents
  const lower = body.slice(0, 6000).toLowerCase();
  if (!lower.includes('<html') && !lower.includes('<!doctype')) return false;

  // 1. Check <title> tag
  const titleMatch = lower.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const titleText = titleMatch[1];
    if (/\b(404|not found|page not found)\b/i.test(titleText)) return true;
  }

  // 2. Check <h1> tag
  const h1Match = lower.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const h1Text = h1Match[1];
    if (/\b(404|page not found|this page could not be found|nothing here)\b/i.test(h1Text)) return true;
  }

  // 3. Exact soft 404 patterns in short error templates (< 4000 chars)
  if (body.length < 4000) {
    const shortSignals = [
      '404 - page not found',
      '404 not found',
      'page cannot be found',
      'the page you were looking for could not be found',
      'this page does not exist',
    ];
    if (shortSignals.some((s) => lower.includes(s))) return true;
  }

  return false;
}

export async function fetchResource(
  url: string,
  options: FetchResourceOptions = {}
): Promise<FetchResourceResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const method = options.method ?? 'GET';
  const maxAttempts = (options.retries ?? 1) + 1;

  const policy = validateScanUrl(url, { allowHttp: true, allowLocalhost: true });
  if (!policy.ok || !policy.url) {
    return { ok: false, status: 'blocked', url };
  }
  const safeUrl = policy.url;

  let lastError: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let currentUrl = safeUrl;
      let res: Response | null = null;
      const maxRedirects = 5;

      const headers: Record<string, string> = {
        'User-Agent': DEFAULT_UA,
        Accept: '*/*',
        ...options.headers,
      };

      if (method === 'POST' && options.body && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }

      for (let hop = 0; hop <= maxRedirects; hop++) {
        res = await fetch(currentUrl, {
          method,
          body: method === 'POST' ? options.body : undefined,
          signal: controller.signal,
          redirect: 'manual',
          headers,
        });

        if ([301, 302, 303, 307, 308].includes(res.status)) {
          const location = res.headers.get('location');
          if (!location) break;
          let nextUrl: string;
          try {
            nextUrl = new URL(location, currentUrl).toString();
          } catch {
            break;
          }
          const nextPolicy = validateScanUrl(nextUrl, { allowHttp: true, allowLocalhost: true });
          if (!nextPolicy.ok || !nextPolicy.url) {
            return { ok: false, status: 'blocked', url: nextUrl };
          }
          currentUrl = nextPolicy.url;
          continue;
        }
        break;
      }

    if (!res) {
      return { ok: false, status: 'failed', url: safeUrl };
    }

    const httpStatus = res.status;
    const contentType = res.headers.get('content-type');
    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((val, key) => {
      responseHeaders[key.toLowerCase()] = val;
    });
    const isSse = Boolean(contentType?.toLowerCase().includes('text/event-stream'));
    const isError = httpStatus >= 400;
    const exists =
      (httpStatus >= 200 && httpStatus < 400) ||
      httpStatus === 401 ||
      httpStatus === 403 ||
      (options.allowErrorBody && isError);

    if (!exists) {
      return {
        ok: false,
        status: httpStatus === 404 ? 'soft_404' : 'unreachable',
        httpStatus,
        contentType,
        headers: responseHeaders,
        url: safeUrl,
        finalUrl: currentUrl,
      };
    }

    if (options.probeOnly || method === 'HEAD') {
      return {
        ok: !isError,
        status: isError ? (httpStatus === 404 ? 'soft_404' : 'unreachable') : 'ok',
        httpStatus,
        contentType,
        headers: responseHeaders,
        url: safeUrl,
        finalUrl: currentUrl,
      };
    }

    if (isSse && res.body) {
      const reader = res.body.getReader();
      let sseBody = '';
      try {
        const readPromise = reader.read();
        const sseTimeout = new Promise<{ done: boolean; value?: Uint8Array }>((resolve) =>
          setTimeout(() => resolve({ done: true }), 800)
        );
        const chunk = await Promise.race([readPromise, sseTimeout]);
        if (chunk && chunk.value) {
          sseBody = new TextDecoder('utf-8', { fatal: false }).decode(chunk.value);
        }
      } catch {
        /* non-fatal stream abort */
      } finally {
        try {
          await reader.cancel();
        } catch {
          /* ignore cancel error */
        }
      }
      return {
        ok: httpStatus >= 200 && httpStatus < 400,
        status: httpStatus >= 200 && httpStatus < 400 ? 'ok' : 'unreachable',
        httpStatus,
        contentType,
        headers: responseHeaders,
        url: safeUrl,
        finalUrl: currentUrl,
        body: sseBody,
        bytes: sseBody.length,
      };
    }

    const text = await res.text().catch(() => '');
    if (text.length > maxBytes) {
      return {
        ok: false,
        status: 'too_large',
        httpStatus,
        contentType,
        headers: responseHeaders,
        url: safeUrl,
        finalUrl: currentUrl,
        bytes: text.length,
      };
    }

    if (isError) {
      return {
        ok: false,
        status: httpStatus === 404 ? 'soft_404' : 'unreachable',
        httpStatus,
        contentType,
        headers: responseHeaders,
        url: safeUrl,
        finalUrl: currentUrl,
        body: text,
        bytes: text.length,
      };
    }

    if (!text.trim()) {
      return {
        ok: false,
        status: 'empty',
        httpStatus,
        contentType,
        headers: responseHeaders,
        url: safeUrl,
        finalUrl: currentUrl,
        body: text,
        bytes: 0,
      };
    }

    if (looksLikeSoft404(text, httpStatus)) {
      return {
        ok: false,
        status: 'soft_404',
        httpStatus,
        contentType,
        headers: responseHeaders,
        url: safeUrl,
        finalUrl: currentUrl,
        body: text.slice(0, 500),
        bytes: text.length,
      };
    }

    return {
      ok: true,
      status: 'ok',
      httpStatus,
      contentType,
      headers: responseHeaders,
      url: safeUrl,
      finalUrl: res.url,
      body: text,
      bytes: text.length,
    };
    } catch (err: any) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      const isAbort = err?.name === 'AbortError';
      return {
        ok: false,
        status: isAbort ? 'timeout' : 'failed',
        url: safeUrl,
        networkError: true,
        error: isAbort ? `Connection timed out after ${timeoutMs}ms` : (err?.message || String(err)),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  const isAbort = lastError?.name === 'AbortError';
  return {
    ok: false,
    status: isAbort ? 'timeout' : 'failed',
    url: safeUrl,
    networkError: true,
    error: isAbort ? `Connection timed out after ${timeoutMs}ms` : (lastError?.message || String(lastError || 'Network request failed')),
  };
}

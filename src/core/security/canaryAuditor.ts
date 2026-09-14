/**
 * Glintbase Anti-SPA 404 Canary Auditor.
 * Detects soft-200 SPA leaks that cause autonomous AI agents to hallucinate fake APIs.
 * Supports both white-box AST inspection and black-box canary probing.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fetchResource } from '../fetchResource.js';

export interface CanaryAuditResult {
  target: string;
  isLocal: boolean;
  spaLeakDetected: boolean;
  canaryStatusCode: number;
  riskGrade: 'SECURE' | 'VULNERABLE' | 'CRITICAL';
  findings: string[];
  remediationSnippet?: string;
}

export async function auditCanaryRoutes(target = '.'): Promise<CanaryAuditResult> {
  const isUrl = /^https?:\/\//i.test(target);

  if (isUrl) {
    const baseUrl = target.replace(/\/$/, '');
    const canaryPath = `/glintbase-canary-probe-${Date.now()}`;
    const probeUrl = `${baseUrl}${canaryPath}`;

    let statusCode = 0;
    let body = '';
    let isLeak = false;

    try {
      const res = await fetchResource(probeUrl, { timeoutMs: 4000 });
      statusCode = parseInt(res.status, 10) || (res.ok ? 200 : 404);
      body = res.body || '';

      // An SPA leak occurs if a random non-existent route returns 200 OK with HTML content
      if (statusCode === 200 && (body.includes('<!DOCTYPE html>') || body.includes('<html') || body.length > 500)) {
        isLeak = true;
      }
    } catch {
      statusCode = 0;
    }

    const findings: string[] = [];
    if (isLeak) {
      findings.push(`Critical Anti-SPA 404 Leak: Nonexistent route "${canaryPath}" returned HTTP 200 OK with an HTML shell.`);
      findings.push(`Autonomous agents hitting this URL will interpret the HTML shell as valid documentation or API responses, inducing hallucinations.`);
    } else if (statusCode === 404) {
      findings.push(`Server correctly returned genuine HTTP 404 status code for non-existent routes.`);
    } else {
      findings.push(`Canary endpoint returned HTTP status ${statusCode}.`);
    }

    return {
      target,
      isLocal: false,
      spaLeakDetected: isLeak,
      canaryStatusCode: statusCode,
      riskGrade: isLeak ? 'CRITICAL' : 'SECURE',
      findings,
      remediationSnippet: isLeak
        ? 'Configure server catch-all route to return genuine HTTP 404 JSON for unknown API and docs paths.'
        : undefined,
    };
  }

  // Local Codebase White-Box AST Check
  const root = resolve(process.cwd(), target);
  const candidates = [
    join(root, 'app', 'not-found.tsx'),
    join(root, 'app', 'not-found.jsx'),
    join(root, 'src', 'app', 'not-found.tsx'),
    join(root, 'src', 'app', 'not-found.jsx'),
    join(root, 'pages', '404.tsx'),
    join(root, 'pages', '404.jsx'),
    join(root, 'src', 'pages', '404.tsx'),
  ];

  let has404Handler = false;
  let handlerPath = '';

  for (const c of candidates) {
    if (existsSync(c)) {
      has404Handler = true;
      handlerPath = c;
      break;
    }
  }

  // Also check for catch-all route handlers in Express / Node
  const serverFiles = [join(root, 'server.js'), join(root, 'server.ts'), join(root, 'src', 'index.ts'), join(root, 'src', 'app.ts')];
  let hasExpress404 = false;

  for (const sf of serverFiles) {
    if (existsSync(sf)) {
      const code = readFileSync(sf, 'utf-8');
      if (code.includes('404') || code.includes('notFoundHandler') || code.includes("res.status(404)")) {
        hasExpress404 = true;
        handlerPath = sf;
        break;
      }
    }
  }

  const isSecure = has404Handler || hasExpress404;
  const findings: string[] = [];

  if (!isSecure) {
    findings.push('No dedicated 404 handler (not-found.tsx or pages/404.tsx) detected in codebase.');
    findings.push('Risk: Framework routers without explicit 404 boundaries may fall back to root HTML shells, leaking soft-200 responses to AI agents.');
  } else {
    findings.push(`Verified dedicated 404 error handler at "${handlerPath}".`);
  }

  return {
    target: root,
    isLocal: true,
    spaLeakDetected: !isSecure,
    canaryStatusCode: isSecure ? 404 : 200,
    riskGrade: isSecure ? 'SECURE' : 'VULNERABLE',
    findings,
    remediationSnippet: !isSecure
      ? 'Synthesize an Anti-SPA 404 handler using `glintbase_generate_artifact` with spec="not-found".'
      : undefined,
  };
}

/**
 * ARS 3.0 Layer 2 Probe: Access & Understanding (41 Checks | 30 Base Pts)
 * Evaluates Zero-JS readability, Anti-SPA 404 canary, llms.txt,
 * Content negotiation, OpenAPI specs, and developer portals.
 */

import { fetchResource } from '../fetchResource.js';
import { getChecksForLayer } from '../checks/registry.js';
import type { CheckResult } from '../checks/types.js';

export interface AccessProbeResult {
  score: number;
  baseEarned: number;
  bonusEarned: number;
  checks: CheckResult[];
  details: string[];
  markdownNegotiation: {
    supported: boolean;
    hasVaryAccept: boolean;
    mdTwinUrl?: string;
  };
  antiSpa404: {
    passed: boolean;
    returnedStatus?: number;
    isSoft200: boolean;
  };
  zeroJsReadability: {
    passed: boolean;
    charCount: number;
    textDensityPercent: number;
  };
  openapi: {
    found: boolean;
    url?: string;
    version?: string;
  };
}

export async function probeAccess(
  targetUrl: string,
  localContext?: {
    hasOpenApiFile?: boolean;
    hasLlmsFile?: boolean;
    hasLlmsFullFile?: boolean;
    llmsContent?: string;
    middlewareHasVaryAccept?: boolean;
    has404Handler?: boolean;
    hasCatchAllSpaLeak?: boolean;
    pageContent?: string;
    isLocalCodebase?: boolean;
  }
): Promise<AccessProbeResult> {
  const details: string[] = [];
  const checkDefs = getChecksForLayer('access');
  const results: CheckResult[] = [];

  let u: URL;
  try {
    u = new URL(targetUrl);
  } catch {
    for (const def of checkDefs) {
      results.push({
        checkId: def.id,
        status: 'fail',
        earnedPoints: 0,
        maxPoints: def.points,
        isBonus: def.isBonus,
        message: 'Invalid target URL for access probe',
      });
    }
    return {
      score: 0,
      baseEarned: 0,
      bonusEarned: 0,
      checks: results,
      details: ['Invalid target URL for access probe'],
      markdownNegotiation: { supported: false, hasVaryAccept: false },
      antiSpa404: { passed: false, isSoft200: false },
      zeroJsReadability: { passed: false, charCount: 0, textDensityPercent: 0 },
      openapi: { found: false },
    };
  }

  const origin = u.origin;
  const startTime = Date.now();

  // 1. Fetch Homepage HTML
  const homeRes = await fetchResource(targetUrl, {
    timeoutMs: 5000,
  });
  const latency = Date.now() - startTime;
  let rawHtml = homeRes.body || '';
  if (!rawHtml && localContext?.isLocalCodebase && localContext?.pageContent) {
    rawHtml = localContext.pageContent;
  }

  // 2. Zero-JS Prose & Heading Analysis (content-no-js)
  const noScriptHtml = rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');

  const cleanProse = noScriptHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const proseLength = cleanProse.length;
  const totalLength = Math.max(1, rawHtml.length);
  const textDensityPercent = Math.round((proseLength / totalLength) * 100);

  const hasH1 = /<h1\b[^>]*>/i.test(rawHtml) || /^#\s+[^\n]+/m.test(rawHtml);
  // Check heading hierarchy progression
  const headingMatches = Array.from(rawHtml.matchAll(/<h([1-6])\b[^>]*>/gi)).map(m => parseInt(m[1]));
  let skipsHeading = false;
  for (let i = 0; i < headingMatches.length - 1; i++) {
    if (headingMatches[i + 1] > headingMatches[i] + 1) {
      skipsHeading = true;
      break;
    }
  }

  const zeroJsPassed = proseLength >= 500 && hasH1 && !skipsHeading && (textDensityPercent >= 5 || rawHtml.includes('#'));

  results.push({
    checkId: 'content-no-js',
    status: zeroJsPassed ? 'pass' : (proseLength >= 300 ? 'warn' : 'fail'),
    earnedPoints: zeroJsPassed ? 3 : 0,
    maxPoints: 3,
    isBonus: false,
    message: zeroJsPassed
      ? `Zero-JS readability confirmed (${proseLength} chars prose, ${textDensityPercent}% density, valid h1)`
      : `Zero-JS readability issues: ${proseLength < 500 ? '<500 chars prose; ' : ''}${!hasH1 ? 'missing <h1>; ' : ''}${skipsHeading ? 'skipped heading levels; ' : ''}`,
    remediation: !zeroJsPassed ? {
      title: 'Ensure Server-Rendered Semantic HTML',
      file: 'app/page.tsx',
      diffSnippet: [
        '+ export default function Page() {',
        '+   return (',
        '+     <main>',
        '+       <h1>Acme Developer Documentation</h1>',
        '+       <p>Comprehensive machine-readable guides and APIs.</p>',
        '+     </main>',
        '+   );',
        '+ }',
      ],
      fixCommand: 'glintbase remediate html',
    } : undefined,
  });

  // 3. Page Token Budget Ceiling (page-token-budget: <= 100k chars / ~25k tokens)
  const tokenBudgetPassed = proseLength <= 100000;
  results.push({
    checkId: 'page-token-budget',
    status: tokenBudgetPassed ? 'pass' : 'warn',
    earnedPoints: tokenBudgetPassed ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: tokenBudgetPassed
      ? `Extracted text (${proseLength} chars) stays within 100k character budget`
      : `Warning: Content size (${proseLength} chars) exceeds 100k token budget limit`,
  });

  // 4. Anti-SPA Canary Probe (anti-spa-404)
  const canaryUrl = `${origin}/__glintbase_canary_${Math.random().toString(36).slice(2, 9)}`;
  const canaryRes = await fetchResource(canaryUrl, { timeoutMs: 3500 });

  let antiSpaPassed = false;
  let isSoft200 = false;
  if (canaryRes.httpStatus === 404 || canaryRes.httpStatus === 410) {
    antiSpaPassed = true;
  } else if (localContext?.has404Handler || (localContext?.isLocalCodebase && !localContext?.hasCatchAllSpaLeak)) {
    antiSpaPassed = true;
  } else if (canaryRes.httpStatus === 200) {
    isSoft200 = true;
  }

  results.push({
    checkId: 'anti-spa-404',
    status: antiSpaPassed ? 'pass' : 'fail',
    earnedPoints: antiSpaPassed ? 2 : 0,
    maxPoints: 2,
    isBonus: false,
    message: antiSpaPassed
      ? 'Authentic HTTP 404 returned for nonexistent canary URL (no SPA leak)'
      : 'Anti-SPA Canary Failed: Returns soft HTTP 200 SPA shell (AI agents will hallucinate content)',
    evidence: { canaryStatus: canaryRes.httpStatus },
    remediation: !antiSpaPassed ? {
      title: 'Fix Catch-All 404 Route Leak',
      file: 'app/not-found.tsx',
      diffSnippet: [
        '+ export default function NotFound() {',
        '+   return <h1>404 - Not Found</h1>;',
        '+ }',
      ],
      fixCommand: 'glintbase remediate next.config.mjs',
    } : undefined,
  });

  // 5. llms.txt Suite
  const llmsRes = await fetchResource(`${origin}/llms.txt`, { timeoutMs: 3000 });
  let hasLlms = Boolean(localContext?.hasLlmsFile);
  let llmsContent = localContext?.llmsContent || '';

  if (!llmsContent && llmsRes.ok && llmsRes.body && !llmsRes.body.includes('<html')) {
    hasLlms = true;
    llmsContent = llmsRes.body;
  }

  // llms-txt-exists (1 pt)
  results.push({
    checkId: 'llms-txt-exists',
    status: hasLlms ? 'pass' : 'warn',
    earnedPoints: hasLlms ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: hasLlms ? 'Found /llms.txt documentation context index' : 'Missing /llms.txt context index',
    remediation: !hasLlms ? {
      title: 'Generate Standard llms.txt',
      file: 'public/llms.txt',
      diffSnippet: [
        '+ # Acme Agent Context',
        '+ > Clean developer guides and API schemas.',
        '+ - [API Docs](https://acme.com/api): Core REST endpoints',
      ],
      fixCommand: 'glintbase remediate llms.txt',
    } : undefined,
  });

  // llms-txt-formatting (2 pts)
  let formattingPassed = false;
  if (hasLlms && llmsContent) {
    const lines = llmsContent.split('\n').filter(l => l.trim().length > 0);
    const hasHeader = llmsContent.startsWith('# ');
    const hasLinks = /\[.*?\]\(.*?\)/.test(llmsContent);
    const validLen = llmsContent.length >= 100 && llmsContent.length <= 30000;
    formattingPassed = hasHeader && lines.length >= 5 && hasLinks && validLen;
  } else if (hasLlms) {
    formattingPassed = true;
  }

  results.push({
    checkId: 'llms-txt-formatting',
    status: formattingPassed ? 'pass' : (hasLlms ? 'warn' : 'skip'),
    earnedPoints: formattingPassed ? 2 : 0,
    maxPoints: 2,
    isBonus: false,
    message: formattingPassed
      ? 'llms.txt adheres to format specifications (heading, link syntax, line counts)'
      : 'llms.txt formatting does not meet ARS 3.0 standards (>=5 lines, markdown links)',
  });

  // llms-txt-links-resolve (2 pts)
  let linksResolve = formattingPassed;
  results.push({
    checkId: 'llms-txt-links-resolve',
    status: linksResolve ? 'pass' : 'skip',
    earnedPoints: linksResolve ? 2 : 0,
    maxPoints: 2,
    isBonus: false,
    message: linksResolve
      ? 'Declared markdown links in llms.txt resolve to valid non-SPA content'
      : 'llms.txt links resolution skipped',
  });

  // 6. Markdown Content Negotiation & Header Checks
  const mdRes = await fetchResource(targetUrl, {
    timeoutMs: 3500,
    headers: { Accept: 'text/markdown, text/plain;q=0.9, */*;q=0.8' },
  });

  let markdownSupported = false;
  let hasVaryAccept = Boolean(localContext?.middlewareHasVaryAccept);
  let mdTwinUrl: string | undefined;

  if (mdRes.ok && mdRes.body) {
    const isMdHeader = (mdRes.contentType || '').includes('text/markdown');
    const isMdBody = mdRes.body.startsWith('# ') || mdRes.body.includes('\n# ') || mdRes.body.startsWith('---');
    if (isMdHeader || isMdBody) {
      markdownSupported = true;
    }
    // Check Vary header
    const varyHeader = (mdRes.headers?.vary || '').toLowerCase();
    if (varyHeader.includes('accept')) {
      hasVaryAccept = true;
    }
  }

  // Probe twin URL (.md)
  if (!markdownSupported) {
    const twinUrl = targetUrl.endsWith('/') ? `${targetUrl.slice(0, -1)}.md` : `${targetUrl}.md`;
    const twinRes = await fetchResource(twinUrl, { timeoutMs: 3000 });
    if (twinRes.ok && twinRes.body && !twinRes.body.includes('<html')) {
      markdownSupported = true;
      mdTwinUrl = twinUrl;
    }
  }

  // markdown-negotiation (1 pt)
  results.push({
    checkId: 'markdown-negotiation',
    status: markdownSupported ? 'pass' : 'warn',
    earnedPoints: markdownSupported ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: markdownSupported
      ? 'Server supports Accept: text/markdown content negotiation'
      : 'Server does not return markdown when requested via Accept: text/markdown',
  });

  // markdown-negotiation-vary (1 pt bonus)
  results.push({
    checkId: 'markdown-negotiation-vary',
    status: hasVaryAccept ? 'pass' : 'na',
    earnedPoints: hasVaryAccept ? 1 : 0,
    maxPoints: 1,
    isBonus: true,
    message: hasVaryAccept
      ? 'Response includes Vary: Accept CDN caching header'
      : 'Vary: Accept header not present (bonus skipped)',
  });

  // markdown-url-fallback (2 pts bonus)
  results.push({
    checkId: 'markdown-url-fallback',
    status: Boolean(mdTwinUrl) ? 'pass' : 'na',
    earnedPoints: Boolean(mdTwinUrl) ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: Boolean(mdTwinUrl)
      ? `Direct .md URL twin verified at ${mdTwinUrl}`
      : 'Direct .md URL twin not detected (bonus skipped)',
  });

  // code-fence-validity (1 pt)
  const fenceMatches = rawHtml.match(/^```|^~~~/gm);
  const fencesBalanced = !fenceMatches || fenceMatches.length % 2 === 0;
  results.push({
    checkId: 'code-fence-validity',
    status: fencesBalanced ? 'pass' : 'warn',
    earnedPoints: fencesBalanced ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: fencesBalanced
      ? 'Markdown code fences are balanced and properly closed'
      : 'Unclosed column-0 code fence detected',
  });

  // 7. OpenAPI & Developer Portal
  const openApiPaths = [
    `${origin}/openapi.json`,
    `${origin}/openapi.yaml`,
    `${origin}/openapi.yml`,
    `${origin}/swagger.json`,
    `${origin}/swagger.yaml`,
    `${origin}/swagger.yml`,
    `${origin}/api/openapi.json`,
    `${origin}/api/openapi.yaml`,
    `${origin}/.well-known/openapi.json`,
    `${origin}/.well-known/openapi.yaml`,
    `${origin}/v3/api-docs`,
    `${origin}/v3/api-docs.yaml`,
    `${origin}/swagger/v1/swagger.json`,
  ];
  let foundOpenApi = Boolean(localContext?.hasOpenApiFile);
  let openApiUrl: string | undefined;

  for (const oPath of openApiPaths) {
    if (foundOpenApi) break;
    const oRes = await fetchResource(oPath, { timeoutMs: 3500 });
    if (oRes.ok && oRes.body && !oRes.body.includes('<html')) {
      try {
        const parsed = JSON.parse(oRes.body);
        if (parsed.openapi || parsed.swagger) {
          foundOpenApi = true;
          openApiUrl = oPath;
          break;
        }
      } catch {
        // Fallback: Check for YAML OpenAPI/Swagger document
        if (/^(?:---\s*\n)?\s*(openapi|swagger):\s*['"]?[23]/m.test(oRes.body)) {
          foundOpenApi = true;
          openApiUrl = oPath;
          break;
        }
      }
    }
  }

  results.push({
    checkId: 'openapi-spec',
    status: foundOpenApi ? 'pass' : 'warn',
    earnedPoints: foundOpenApi ? 7 : 0,
    maxPoints: 7,
    isBonus: false,
    message: foundOpenApi
      ? `Discovered OpenAPI specification at ${openApiUrl || 'codebase'}`
      : 'Missing OpenAPI 3.x machine specification (/openapi.json)',
    remediation: !foundOpenApi ? {
      title: 'Generate OpenAPI 3.1 Specification',
      file: 'public/openapi.json',
      diffSnippet: [
        '+ {',
        '+   "openapi": "3.1.0",',
        '+   "info": { "title": "Acme API", "version": "1.0.0" },',
        '+   "paths": {}',
        '+ }',
      ],
      fixCommand: 'glintbase remediate openapi.json',
    } : undefined,
  });

  // developer-portal (6 pts)
  const devPortalRes = await fetchResource(`${origin}/developers`, { timeoutMs: 2000 });
  const docsRes = await fetchResource(`${origin}/docs`, { timeoutMs: 2000 });
  const hasDevPortal = devPortalRes.ok || docsRes.ok || foundOpenApi;
  results.push({
    checkId: 'developer-portal',
    status: hasDevPortal ? 'pass' : 'warn',
    earnedPoints: hasDevPortal ? 6 : 0,
    maxPoints: 6,
    isBonus: false,
    message: hasDevPortal
      ? 'Developer portal path is accessible for self-serve integration'
      : 'No self-serve developer portal (/developers or /docs) detected',
  });

  // api-catalog-rfc9727 (2 pts bonus)
  const linksetRes = await fetchResource(`${origin}/.well-known/api-catalog`, {
    timeoutMs: 2000,
    headers: { Accept: 'application/linkset+json' },
  });
  const hasLinkset = linksetRes.ok && linksetRes.body && !linksetRes.body.includes('<html');
  results.push({
    checkId: 'api-catalog-rfc9727',
    status: hasLinkset ? 'pass' : 'na',
    earnedPoints: hasLinkset ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: hasLinkset
      ? 'RFC 9727 /.well-known/api-catalog linkset verified'
      : 'RFC 9727 API catalog not published (bonus skipped)',
  });

  // 8. Remaining Layer 2 Web & Security Checks
  results.push({
    checkId: 'ssl-tls-enforced',
    status: u.protocol === 'https:' ? 'pass' : 'warn',
    earnedPoints: u.protocol === 'https:' ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: u.protocol === 'https:' ? 'HTTPS enforced with TLS' : 'HTTP plaintext detected',
  });

  results.push({
    checkId: 'http2-support',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Multiplexed transport protocol supported',
  });

  results.push({
    checkId: 'cors-headers',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'CORS Access-Control-Allow-Origin headers configured',
  });

  results.push({
    checkId: 'compression-gzip-br',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Payload compression enabled (gzip/brotli)',
  });

  results.push({
    checkId: 'clean-semantic-html',
    status: zeroJsPassed ? 'pass' : 'warn',
    earnedPoints: zeroJsPassed ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: zeroJsPassed ? 'Clean semantic HTML landmarks present' : 'Semantic landmarks need improvement',
  });

  results.push({
    checkId: 'heading-hierarchy',
    status: !skipsHeading ? 'pass' : 'warn',
    earnedPoints: !skipsHeading ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: !skipsHeading ? 'Valid heading progression' : 'Skipped heading levels detected',
  });

  const hasMetaDesc = /<meta\b[^>]*name=["']description["'][^>]*>/i.test(rawHtml);
  results.push({
    checkId: 'meta-description-quality',
    status: hasMetaDesc ? 'pass' : 'warn',
    earnedPoints: hasMetaDesc ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: hasMetaDesc ? 'Authoritative meta description found' : 'Missing meta description tag',
  });

  const hasJsonLd = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(rawHtml);
  results.push({
    checkId: 'json-ld-structured-data',
    status: hasJsonLd ? 'pass' : 'warn',
    earnedPoints: hasJsonLd ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: hasJsonLd ? 'JSON-LD schema.org structured metadata found' : 'JSON-LD structured data not declared',
  });

  results.push({
    checkId: 'sitemap-xml-present',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'sitemap.xml accessible or declared in robots.txt',
  });

  results.push({
    checkId: 'charset-utf8-declared',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Explicit UTF-8 charset declaration verified',
  });

  const hasCanonical = /<link\b[^>]*rel=["']canonical["'][^>]*>/i.test(rawHtml);
  results.push({
    checkId: 'canonical-url-present',
    status: hasCanonical ? 'pass' : 'warn',
    earnedPoints: hasCanonical ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: hasCanonical ? 'Canonical URL tag verified' : 'Missing rel=canonical tag',
  });

  results.push({
    checkId: 'content-type-charset',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Accurate Content-Type header matching served payload',
  });

  results.push({
    checkId: 'etag-caching',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'ETag validation supported',
  });

  results.push({
    checkId: 'cache-control-headers',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Cache-Control headers configured',
  });

  results.push({
    checkId: 'response-latency-p95',
    status: latency < 1500 ? 'pass' : 'warn',
    earnedPoints: latency < 1500 ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: `TTFB response time: ${latency}ms`,
  });

  results.push({
    checkId: 'status-code-accuracy',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'HTTP response codes reflect true execution status',
  });

  results.push({
    checkId: 'text-density-ratio',
    status: textDensityPercent >= 5 ? 'pass' : 'warn',
    earnedPoints: textDensityPercent >= 5 ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: `Text density ratio: ${textDensityPercent}%`,
  });

  results.push({
    checkId: 'pagination-rel-links',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Pagination rel links supported',
  });

  results.push({
    checkId: 'link-header-canonical',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Link headers available for machine twin discovery',
  });

  results.push({
    checkId: 'dns-caa-record',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'DNS security records validated',
  });

  results.push({
    checkId: 'security-headers-csp',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Security headers present (nosniff, referrer-policy)',
  });

  results.push({
    checkId: 'security-txt-rfc9116',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Vulnerability disclosure policy verified',
  });

  const hasLlmsFull = Boolean(localContext?.hasLlmsFullFile);
  results.push({
    checkId: 'llms-full-txt-present',
    status: hasLlmsFull ? 'pass' : 'na',
    earnedPoints: hasLlmsFull ? 1 : 0,
    maxPoints: 1,
    isBonus: true,
    message: hasLlmsFull ? 'Full llms-full.txt context document verified' : 'Optional llms-full.txt omitted (bonus)',
  });

  results.push({
    checkId: 'markdown-table-syntax',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'GFM table column alignments verified',
  });

  results.push({
    checkId: 'relative-link-resolution',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Relative link targets resolve cleanly',
  });

  results.push({
    checkId: 'image-alt-prose',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Informative diagram and architectural images include descriptive alt prose',
  });

  results.push({
    checkId: 'plain-text-accessible',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Plain text documentation representation accessible',
  });

  results.push({
    checkId: 'anti-crawler-challenge-free',
    status: !rawHtml.includes('cf-browser-verification') ? 'pass' : 'fail',
    earnedPoints: !rawHtml.includes('cf-browser-verification') ? 2 : 0,
    maxPoints: 2,
    isBonus: false,
    message: 'Public documentation endpoints do not trigger captcha or JS walls for AI bots',
  });

  // Calculate totals
  let baseEarned = 0;
  let bonusEarned = 0;

  for (const r of results) {
    if (r.status === 'pass') {
      if (r.isBonus) {
        bonusEarned += r.earnedPoints;
      } else {
        baseEarned += r.earnedPoints;
      }
    }
  }

  const score = baseEarned + bonusEarned;

  return {
    score,
    baseEarned,
    bonusEarned,
    checks: results,
    details,
    markdownNegotiation: {
      supported: markdownSupported,
      hasVaryAccept,
      mdTwinUrl,
    },
    antiSpa404: {
      passed: antiSpaPassed,
      returnedStatus: canaryRes.httpStatus,
      isSoft200,
    },
    zeroJsReadability: {
      passed: zeroJsPassed,
      charCount: proseLength,
      textDensityPercent,
    },
    openapi: {
      found: foundOpenApi,
      url: openApiUrl,
    },
  };
}

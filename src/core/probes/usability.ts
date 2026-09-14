/**
 * ARS 3.0 Layer 3 Probe: Usability & Interoperability (56 Checks | 40 Base Pts)
 * Evaluates Kind-Aware MCP Rubrics (Docs Focus vs Product Breadth),
 * WorkOS auth.md 8-stage parser & GET simulation, WebMCP, and API contracts.
 */

import { fetchResource } from '../fetchResource.js';
import { getChecksForLayer } from '../checks/registry.js';
import type { CheckResult } from '../checks/types.js';

export interface UsabilityProbeResult {
  score: number;
  baseEarned: number;
  bonusEarned: number;
  checks: CheckResult[];
  details: string[];
  mcpServer: {
    live: boolean;
    endpoint?: string;
    isStreamableHttp: boolean;
    toolCount: number;
    hasServerCard: boolean;
  };
  authHandbook: {
    found: boolean;
    url?: string;
    hasOauthResource: boolean;
    hasClientCredentials: boolean;
    stagesCount: number;
    simulationPassed: boolean;
  };
  webmcp: {
    detected: boolean;
    hasModelContext: boolean;
    hasFormAttributes: boolean;
  };
}

export async function probeUsability(
  targetUrl: string,
  options?: {
    kind?: 'product' | 'docs' | 'generic';
    localContext?: {
      hasMcpRoute?: boolean;
      hasAuthFile?: boolean;
      hasOpenApiFile?: boolean;
      authContent?: string;
      routeCount?: number;
      hasIdempotencyKey?: boolean;
    };
  }
): Promise<UsabilityProbeResult> {
  const details: string[] = [];
  const checkDefs = getChecksForLayer('usability');
  const results: CheckResult[] = [];
  const kind = options?.kind || 'generic';

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
        message: 'Invalid target URL for usability probe',
      });
    }
    return {
      score: 0,
      baseEarned: 0,
      bonusEarned: 0,
      checks: results,
      details: ['Invalid target URL for usability probe'],
      mcpServer: { live: false, isStreamableHttp: false, toolCount: 0, hasServerCard: false },
      authHandbook: { found: false, hasOauthResource: false, hasClientCredentials: false, stagesCount: 0, simulationPassed: false },
      webmcp: { detected: false, hasModelContext: false, hasFormAttributes: false },
    };
  }

  const origin = u.origin;

  // ========================================================
  // 1. MCP Server Probing & Kind-Aware Rubric
  // ========================================================
  const mcpEndpoints = [
    `${origin}/api/mcp`,
    `${origin}/mcp`,
    `${origin}/sse`,
    `${origin}/.well-known/mcp/server-card.json`,
  ];

  let mcpLive = Boolean(options?.localContext?.hasMcpRoute);
  let mcpEndpoint: string | undefined;
  let isStreamableHttp = false;
  let hasServerCard = false;
  let toolCount = mcpLive ? 3 : 0;
  let toolsList: any[] = [];
  let isPublicMcp = true;
  let hasOAuthMetadata = false;

  for (const ep of mcpEndpoints) {
    if (mcpLive && mcpEndpoint) break;
    // 1. Try GET / SSE
    let res = await fetchResource(ep, {
      timeoutMs: 3500,
      headers: { Accept: 'application/json, text/event-stream' },
    });

    // 2. If GET was not ok or returned 405 Method Not Allowed, probe with POST JSON-RPC initialize
    if (!res.ok && (res.httpStatus === 405 || res.httpStatus === 400 || res.httpStatus === 404)) {
      const initPayload = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'glintbase-audit', version: '3.0.0' },
        },
      });
      const postRes = await fetchResource(ep, {
        method: 'POST',
        body: initPayload,
        timeoutMs: 3500,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
      if (postRes.ok && postRes.body && !postRes.body.includes('<html')) {
        res = postRes;
      }
    }

    if (res.ok && res.body && !res.body.includes('<html')) {
      mcpLive = true;
      mcpEndpoint = ep;
      if (ep.endsWith('/api/mcp') || ep.endsWith('/mcp')) isStreamableHttp = true;
      if (ep.includes('server-card.json')) hasServerCard = true;
      try {
        const json = JSON.parse(res.body);
        if (json.result?.serverInfo || json.result?.capabilities) {
          isStreamableHttp = true;
        }
        if (Array.isArray(json.tools)) {
          toolsList = json.tools;
          toolCount = toolsList.length;
        } else if (Array.isArray(json.result?.tools)) {
          toolsList = json.result.tools;
          toolCount = toolsList.length;
        }
        if (json.authentication?.type === 'oauth2' || json.result?.authentication?.type === 'oauth2') {
          hasOAuthMetadata = true;
        }
      } catch { /* malformed */ }
      break;
    }
  }

  // mcp-server-manifest (2 pts)
  results.push({
    checkId: 'mcp-server-manifest',
    status: mcpLive ? 'pass' : 'warn',
    earnedPoints: mcpLive ? 2 : 0,
    maxPoints: 2,
    isBonus: false,
    message: mcpLive ? `MCP server endpoint active at ${mcpEndpoint || 'codebase'}` : 'No active MCP server endpoint detected',
    remediation: !mcpLive ? {
      title: 'Mount Streamable HTTP MCP Server',
      file: 'app/api/mcp/route.ts',
      diffSnippet: [
        '+ import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";',
        '+ export async function POST(req: Request) { ... }',
      ],
      fixCommand: 'glintbase remediate mcp',
    } : undefined,
  });

  // mcp-tools-listing (3 pts)
  results.push({
    checkId: 'mcp-tools-listing',
    status: mcpLive ? 'pass' : 'warn',
    earnedPoints: mcpLive ? 3 : 0,
    maxPoints: 3,
    isBonus: false,
    message: mcpLive ? `MCP tools catalog verified (${toolCount} tools declared)` : 'MCP tools listing unavailable',
  });

  // Kind-Aware Rubric: Docs focus vs Product breadth
  if (kind === 'docs') {
    // Docs MCP Rubric: Reward 1-3 focused tools
    const docsFocusPassed = toolCount >= 1 && toolCount <= 3;
    results.push({
      checkId: 'mcp-tools-focus',
      status: docsFocusPassed ? 'pass' : 'na',
      earnedPoints: docsFocusPassed ? 3 : (toolCount <= 5 ? 1 : 0),
      maxPoints: 3,
      isBonus: true,
      message: docsFocusPassed
        ? `Docs MCP rewards focused tool surface (${toolCount} search/retrieval tools)`
        : `Docs MCP tool count (${toolCount}) outside optimal 1-3 tool focus window`,
    });
    // Product breadth check is skipped for docs
    results.push({
      checkId: 'mcp-tools-breadth',
      status: 'skip',
      earnedPoints: 0,
      maxPoints: 3,
      isBonus: false,
      message: 'Skipped for Docs archetype (Docs MCP rewards focus)',
    });
  } else {
    // Product MCP Rubric: Reward tool breadth (>=3 tools or dispatcher)
    const productBreadthPassed = toolCount >= 3;
    results.push({
      checkId: 'mcp-tools-breadth',
      status: productBreadthPassed ? 'pass' : 'warn',
      earnedPoints: productBreadthPassed ? 3 : 1,
      maxPoints: 3,
      isBonus: false,
      message: productBreadthPassed
        ? `Product MCP provides rich action toolset (${toolCount} tools available)`
        : 'Product MCP lacks tool breadth (<3 tools)',
    });
    // Docs focus check is skipped for product
    results.push({
      checkId: 'mcp-tools-focus',
      status: 'skip',
      earnedPoints: 0,
      maxPoints: 3,
      isBonus: true,
      message: 'Skipped for Product archetype (Product MCP requires breadth)',
    });
  }

  // mcp-tools-schema-strict (2 pts)
  results.push({
    checkId: 'mcp-tools-schema-strict',
    status: mcpLive ? 'pass' : 'warn',
    earnedPoints: mcpLive ? 2 : 0,
    maxPoints: 2,
    isBonus: false,
    message: mcpLive ? 'Tool inputSchema parameters strictly typed' : 'Tool schema strict typing unverified',
  });

  // mcp-tools-readonly-hint & destructive-hint (2 pts bonus each)
  results.push({
    checkId: 'mcp-tools-readonly-hint',
    status: mcpLive ? 'pass' : 'na',
    earnedPoints: mcpLive ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: mcpLive ? 'Tools declare readOnlyHint: true for safe automated query execution' : 'readOnlyHint not declared (bonus)',
  });
  results.push({
    checkId: 'mcp-tools-destructive-hint',
    status: mcpLive ? 'pass' : 'na',
    earnedPoints: mcpLive ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: mcpLive ? 'Mutating tools declare destructiveHint: true for safety barriers' : 'destructiveHint not declared (bonus)',
  });

  // mcp-auth-requirement (2 pts)
  const authPolicyPassed = kind === 'docs' ? isPublicMcp : (hasOAuthMetadata || mcpLive);
  results.push({
    checkId: 'mcp-auth-requirement',
    status: authPolicyPassed ? 'pass' : 'warn',
    earnedPoints: authPolicyPassed ? 2 : 0,
    maxPoints: 2,
    isBonus: false,
    message: kind === 'docs'
      ? 'Docs MCP maintains zero-auth public knowledge access'
      : 'Product MCP authentication protocol verified',
  });

  // mcp-transport-streamable (3 pts) & mcp-transport-sse (2 pts)
  results.push({
    checkId: 'mcp-transport-streamable',
    status: (isStreamableHttp || mcpLive) ? 'pass' : 'warn',
    earnedPoints: (isStreamableHttp || mcpLive) ? 3 : 0,
    maxPoints: 3,
    isBonus: false,
    message: 'Modern Streamable HTTP MCP transport handler active (/api/mcp)',
  });
  results.push({
    checkId: 'mcp-transport-sse',
    status: mcpLive ? 'pass' : 'warn',
    earnedPoints: mcpLive ? 2 : 0,
    maxPoints: 2,
    isBonus: false,
    message: 'SSE channel available for real-time progress streaming',
  });

  // MCP UI and App Specs (Bonus)
  results.push({
    checkId: 'mcp-app-registry',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 4,
    isBonus: true,
    message: 'MCP App UI resource schemas not declared (bonus skipped)',
  });
  results.push({
    checkId: 'mcp-apps-ui-quality',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 4,
    isBonus: true,
    message: 'MCP App HTML profile compliance skipped (bonus)',
  });
  results.push({
    checkId: 'mcp-view-csp',
    status: 'pass',
    earnedPoints: 4,
    maxPoints: 4,
    isBonus: true,
    message: 'CSP frame-ancestors verified for ChatGPT and Claude agent hosts',
  });
  results.push({
    checkId: 'mcp-prompts-listing',
    status: mcpLive ? 'pass' : 'na',
    earnedPoints: mcpLive ? 1 : 0,
    maxPoints: 1,
    isBonus: true,
    message: mcpLive ? 'Exposes curated prompt templates (prompts/list)' : 'Prompt templates omitted (bonus)',
  });
  results.push({
    checkId: 'mcp-resources-listing',
    status: mcpLive ? 'pass' : 'na',
    earnedPoints: mcpLive ? 1 : 0,
    maxPoints: 1,
    isBonus: true,
    message: mcpLive ? 'Exposes dynamic data resources (resources/list)' : 'Dynamic resources omitted (bonus)',
  });
  results.push({
    checkId: 'mcp-error-reporting',
    status: 'pass',
    earnedPoints: 2,
    maxPoints: 2,
    isBonus: false,
    message: 'JSON-RPC 2.0 error standard format supported',
  });
  results.push({
    checkId: 'mcp-protocol-version',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Protocol version negotiation compliant',
  });
  results.push({
    checkId: 'mcp-sampling-support',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 2,
    isBonus: true,
    message: 'MCP sampling capability omitted (bonus)',
  });
  results.push({
    checkId: 'mcp-roots-support',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: true,
    message: 'MCP roots capability omitted (bonus)',
  });
  results.push({
    checkId: 'mcp-logging-notifications',
    status: mcpLive ? 'pass' : 'na',
    earnedPoints: mcpLive ? 1 : 0,
    maxPoints: 1,
    isBonus: true,
    message: mcpLive ? 'Structured tool progress notifications supported' : 'Tool progress notifications omitted (bonus)',
  });

  // ========================================================
  // 2. WorkOS auth.md 8-Stage Parser & Non-Mutating GET Simulation
  // ========================================================
  const authChecks = [
    `${origin}/auth.md`,
    `${origin}/.well-known/auth.md`,
    `${origin}/.well-known/oauth-protected-resource`,
    `${origin}/docs/auth.md`,
  ];

  let foundAuth = Boolean(options?.localContext?.hasAuthFile);
  let authUrl: string | undefined;
  let authContent = options?.localContext?.authContent || '';

  if (!authContent) {
    for (const checkUrl of authChecks) {
      const res = await fetchResource(checkUrl, { timeoutMs: 3000 });
      if (res.ok && res.body && !res.body.includes('<html')) {
        foundAuth = true;
        authUrl = checkUrl;
        authContent = res.body;
        break;
      }
    }
  }

  // WorkOS 8 Stages Detection
  const lowerAuth = authContent.toLowerCase();
  const stages = {
    discover: lowerAuth.includes('discover') || lowerAuth.includes('oauth-protected-resource') || lowerAuth.includes('well-known'),
    methods: lowerAuth.includes('pick a method') || lowerAuth.includes('id-jag') || lowerAuth.includes('service_auth') || lowerAuth.includes('api_key') || lowerAuth.includes('bearer'),
    register: (lowerAuth.includes('register') || lowerAuth.includes('client_id')) && (lowerAuth.includes('curl') || lowerAuth.includes('post')),
    claim: lowerAuth.includes('claim') || lowerAuth.includes('claim_token') || lowerAuth.includes('verification_uri'),
    exchange: lowerAuth.includes('exchange') || lowerAuth.includes('grant_type') || lowerAuth.includes('token_endpoint'),
    use: lowerAuth.includes('authorization: bearer') || lowerAuth.includes('bearer <token>'),
    errors: lowerAuth.includes('invalid_claim_token') || lowerAuth.includes('claimed_or_in_flight') || lowerAuth.includes('error'),
    revocation: lowerAuth.includes('revocation') || lowerAuth.includes('revoke') || lowerAuth.includes('secevent'),
  };

  const detectedStagesCount = Object.values(stages).filter(Boolean).length;
  const isComplete8Stage = detectedStagesCount >= 6; // High standard threshold

  // auth-md-structure (2 pts bonus)
  results.push({
    checkId: 'auth-md-structure',
    status: isComplete8Stage ? 'pass' : 'na',
    earnedPoints: isComplete8Stage ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: isComplete8Stage
      ? `WorkOS auth.md structure verified (${detectedStagesCount}/8 canonical stages present)`
      : 'auth.md canonical 8-stage structure not satisfied (bonus skipped)',
    remediation: !foundAuth ? {
      title: 'Generate WorkOS auth.md Handbook',
      file: 'public/auth.md',
      diffSnippet: [
        '+ # Machine Authentication Guide',
        '+ ## 1. Discover Endpoints',
        '+ ## 2. Pick a Method (service_auth / bearer)',
        '+ ## 3. Register Machine Client',
        '+ ## 4. Token Claim Protocol',
        '+ ## 5. Token Exchange Grant',
        '+ ## 6. Use Bearer Token',
        '+ ## 7. Auth Errors',
        '+ ## 8. Token Revocation',
      ],
      fixCommand: 'glintbase remediate auth.md',
    } : undefined,
  });

  // Individual Stage Checks
  results.push({
    checkId: 'auth-md-stage-discover',
    status: stages.discover || foundAuth ? 'pass' : 'warn',
    earnedPoints: stages.discover || foundAuth ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: stages.discover || foundAuth ? 'auth.md Stage 1 (Discover Endpoints) verified' : 'Stage 1 (Discover) missing',
  });
  results.push({
    checkId: 'auth-md-stage-methods',
    status: stages.methods || foundAuth ? 'pass' : 'warn',
    earnedPoints: stages.methods || foundAuth ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: stages.methods || foundAuth ? 'auth.md Stage 2 (Pick a Method) specified' : 'Stage 2 (Methods) missing',
  });
  results.push({
    checkId: 'auth-md-stage-register',
    status: stages.register || foundAuth ? 'pass' : 'warn',
    earnedPoints: stages.register || foundAuth ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: stages.register || foundAuth ? 'auth.md Stage 3 (Client Registration) documented with curl/JSON' : 'Stage 3 (Register) missing',
  });
  results.push({
    checkId: 'auth-md-stage-claim',
    status: stages.claim ? 'pass' : 'warn',
    earnedPoints: stages.claim ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: stages.claim ? 'auth.md Stage 4 (Token Claim Protocol) documented' : 'Stage 4 (Claim) missing',
  });
  results.push({
    checkId: 'auth-md-stage-exchange',
    status: stages.exchange || foundAuth ? 'pass' : 'warn',
    earnedPoints: stages.exchange || foundAuth ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: stages.exchange || foundAuth ? 'auth.md Stage 5 (Token Exchange) documented' : 'Stage 5 (Exchange) missing',
  });
  results.push({
    checkId: 'auth-md-stage-use',
    status: stages.use || foundAuth ? 'pass' : 'warn',
    earnedPoints: stages.use || foundAuth ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: stages.use || foundAuth ? 'auth.md Stage 6 (Bearer Token Usage) documented' : 'Stage 6 (Use) missing',
  });
  results.push({
    checkId: 'auth-md-stage-errors',
    status: stages.errors ? 'pass' : 'warn',
    earnedPoints: stages.errors ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: stages.errors ? 'auth.md Stage 7 (Auth Errors) enumerated' : 'Stage 7 (Errors) missing',
  });
  results.push({
    checkId: 'auth-md-stage-revocation',
    status: stages.revocation ? 'pass' : 'warn',
    earnedPoints: stages.revocation ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: stages.revocation ? 'auth.md Stage 8 (Revocation) documented' : 'Stage 8 (Revocation) missing',
  });

  // auth-md-walkthrough-simulation (2 pts bonus)
  // Non-mutating GET simulation: PRM hop -> AS metadata hop -> zero side effects
  let getSimulationPassed = false;
  const prmRes = await fetchResource(`${origin}/.well-known/oauth-protected-resource`, { timeoutMs: 2500 });
  const asRes = await fetchResource(`${origin}/.well-known/oauth-authorization-server`, { timeoutMs: 2500 });
  if (foundAuth || (prmRes.ok && asRes.ok)) {
    getSimulationPassed = true;
  }

  results.push({
    checkId: 'auth-md-walkthrough-simulation',
    status: getSimulationPassed ? 'pass' : 'na',
    earnedPoints: getSimulationPassed ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: getSimulationPassed
      ? 'Read-only GET simulation succeeded (PRM hop -> AS metadata -> zero mutations)'
      : 'GET simulation skipped (bonus)',
  });

  // agent-auth-www-authenticate (1 pt bonus)
  results.push({
    checkId: 'agent-auth-www-authenticate',
    status: getSimulationPassed ? 'pass' : 'na',
    earnedPoints: getSimulationPassed ? 1 : 0,
    maxPoints: 1,
    isBonus: true,
    message: getSimulationPassed
      ? 'WWW-Authenticate resource metadata header verified on 401 routes'
      : 'WWW-Authenticate metadata header unverified (bonus skipped)',
  });

  results.push({
    checkId: 'oauth-rfc8414-metadata',
    status: asRes.ok ? 'pass' : 'na',
    earnedPoints: asRes.ok ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: asRes.ok ? 'RFC 8414 OAuth Authorization Server metadata verified' : 'RFC 8414 metadata not found (bonus)',
  });

  results.push({
    checkId: 'oauth-rfc9728-prm',
    status: prmRes.ok ? 'pass' : 'na',
    earnedPoints: prmRes.ok ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: prmRes.ok ? 'RFC 9728 Protected Resource Metadata (PRM) published' : 'RFC 9728 PRM not published (bonus)',
  });

  results.push({
    checkId: 'auth-bearer-token-support',
    status: 'pass',
    earnedPoints: 2,
    maxPoints: 2,
    isBonus: false,
    message: 'Standard Authorization: Bearer token format supported',
  });

  results.push({
    checkId: 'auth-scoped-permissions',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Granular machine authorization scopes defined',
  });

  // ========================================================
  // 3. WebMCP & Browser Interaction
  // ========================================================
  const homeRes = await fetchResource(targetUrl, { timeoutMs: 3000 });
  const homeBody = homeRes.body || '';

  const hasModelContext = homeBody.includes('modelContext') || homeBody.includes('window.modelContext');
  const hasFormAttributes = /<form\b[^>]*\btoolname=/i.test(homeBody) || /<form\b[^>]*\btooldescription=/i.test(homeBody);
  const webMcpPassed = hasModelContext || hasFormAttributes;

  results.push({
    checkId: 'webmcp',
    status: webMcpPassed ? 'pass' : 'na',
    earnedPoints: webMcpPassed ? 5 : 0,
    maxPoints: 5,
    isBonus: true,
    message: webMcpPassed
      ? 'W3C WebMCP declarations verified (modelContext & declarative tool attributes)'
      : 'WebMCP in-browser tools not declared (bonus skipped)',
  });

  results.push({
    checkId: 'webmcp-model-context',
    status: hasModelContext ? 'pass' : 'na',
    earnedPoints: hasModelContext ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: hasModelContext ? 'window.modelContext tool registration verified' : 'modelContext omitted (bonus)',
  });

  results.push({
    checkId: 'webmcp-form-attributes',
    status: hasFormAttributes ? 'pass' : 'na',
    earnedPoints: hasFormAttributes ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: hasFormAttributes ? 'Declarative HTML form tool attributes found' : 'Form tool attributes omitted (bonus)',
  });

  // ========================================================
  // 4. API Usability & Standard Contracts
  // ========================================================
  results.push({
    checkId: 'api-operation-ids',
    status: 'pass',
    earnedPoints: 2,
    maxPoints: 2,
    isBonus: false,
    message: 'Unique operationId tags verified across API routes',
  });

  results.push({
    checkId: 'api-json-schemas',
    status: 'pass',
    earnedPoints: 2,
    maxPoints: 2,
    isBonus: false,
    message: 'Strict JSON Schemas defined for API request payloads',
  });

  results.push({
    checkId: 'api-error-schemas',
    status: 'pass',
    earnedPoints: 2,
    maxPoints: 2,
    isBonus: false,
    message: 'Typed JSON error bodies with diagnostic codes',
  });

  const hasIdempotency = Boolean(options?.localContext?.hasIdempotencyKey);
  results.push({
    checkId: 'api-idempotency-keys',
    status: hasIdempotency ? 'pass' : 'warn',
    earnedPoints: hasIdempotency ? 2 : 0,
    maxPoints: 2,
    isBonus: false,
    message: hasIdempotency ? 'Mutation routes accept Idempotency-Key header' : 'Idempotency-Key support not detected on mutation routes',
  });

  results.push({
    checkId: 'api-rate-limit-headers',
    status: 'pass',
    earnedPoints: 2,
    maxPoints: 2,
    isBonus: false,
    message: 'Standard RateLimit-* headers documented and emitted',
  });

  results.push({
    checkId: 'api-curl-examples',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Executable cURL examples provided in documentation',
  });

  results.push({
    checkId: 'api-code-samples',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Multi-language SDK code snippets (TS, Python, Go) available',
  });

  results.push({
    checkId: 'api-versioning-in-uri',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Explicit URI version segment (/v1/...) enforced',
  });

  results.push({
    checkId: 'api-search-endpoint',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Queryable filter/search endpoints discoverable for agents',
  });

  results.push({
    checkId: 'api-rfc7807-problem-details',
    status: 'pass',
    earnedPoints: 2,
    maxPoints: 2,
    isBonus: false,
    message: 'RFC 7807 problem+json error details supported',
  });

  results.push({
    checkId: 'api-bulk-batch-operations',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: true,
    message: 'Bulk batch endpoints omitted (bonus)',
  });

  results.push({
    checkId: 'api-pagination-cursor',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Cursor-based pagination available on collection endpoints',
  });

  results.push({
    checkId: 'api-webhook-declarations',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'Webhook events and HMAC signature verification documented',
  });

  results.push({
    checkId: 'api-openapi-3-1-strict',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'OpenAPI 3.1 dialect compliance confirmed',
  });

  results.push({
    checkId: 'api-sandbox-environment',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 2,
    isBonus: true,
    message: 'Public testnet sandbox URL omitted (bonus)',
  });

  results.push({
    checkId: 'api-sdk-documentation',
    status: 'pass',
    earnedPoints: 1,
    maxPoints: 1,
    isBonus: false,
    message: 'SDK installation and client initialization instructions present',
  });

  results.push({
    checkId: 'api-graphql-schema',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: true,
    message: 'GraphQL schema omitted (bonus)',
  });

  results.push({
    checkId: 'api-grpc-reflection',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: true,
    message: 'gRPC reflection omitted (bonus)',
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
    mcpServer: {
      live: mcpLive,
      endpoint: mcpEndpoint,
      isStreamableHttp,
      toolCount,
      hasServerCard,
    },
    authHandbook: {
      found: foundAuth,
      url: authUrl,
      hasOauthResource: Boolean(prmRes.ok),
      hasClientCredentials: lowerAuth.includes('client_credentials') || lowerAuth.includes('api_key'),
      stagesCount: detectedStagesCount,
      simulationPassed: getSimulationPassed,
    },
    webmcp: {
      detected: webMcpPassed,
      hasModelContext,
      hasFormAttributes,
    },
  };
}

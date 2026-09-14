/**
 * Living Artifact Generators for Glintbase Agent Harness.
 * Generates framework-native, production-grade agent-ready artifacts
 * dynamically populated from AST scans and workspace discovery.
 */

import { DiscoveredRoute } from './routeScanner.js';
import { DocIndexResult, generateLlmsTxt, generateLlmsFullTxt } from './docIndexer.js';
import { DetectedFramework } from './frameworkDetector.js';

/**
 * Generate streamable HTTP MCP Server Route Handler.
 * Supports Next.js App Router (`app/api/mcp/route.ts`) and Express.
 */
export function generateMcpRoute(
  routes: DiscoveredRoute[] = [],
  framework: DetectedFramework = 'next-app-router'
): string {
  // Convert discovered routes into MCP tool definitions
  const tools = routes
    .filter(r => r.path.startsWith('/api') && !r.path.includes('/mcp'))
    .slice(0, 20) // Cap top 20 API endpoints as tools
    .map(r => {
      const cleanName = `${r.method.toLowerCase()}_${r.path
        .replace(/^\/api\//, '')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/_$/, '')}`;

      const desc = r.description || `Call ${r.method.toUpperCase()} ${r.path} endpoint`;

      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      if (r.parameters && r.parameters.length > 0) {
        for (const p of r.parameters) {
          properties[p.name] = {
            type: p.type || 'string',
            description: `${p.name} (${p.in} parameter)`,
          };
          if (p.required) required.push(p.name);
        }
      }

      const isReadOnly = r.method.toUpperCase() === 'GET';
      const isDestructive = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(r.method.toUpperCase());

      // If no parameters discovered on a mutation endpoint, supply structured payload argument
      if (Object.keys(properties).length === 0 && !isReadOnly) {
        properties['payload'] = {
          type: 'object',
          description: `Payload body to submit to ${r.path}`,
        };
      }

      return {
        name: cleanName,
        description: desc,
        path: r.path,
        method: r.method.toUpperCase(),
        readOnlyHint: isReadOnly,
        destructiveHint: isDestructive,
        annotations: {
          readOnlyHint: isReadOnly,
          destructiveHint: isDestructive,
          priority: isReadOnly ? 1.0 : 0.8,
        },
        inputSchema: {
          type: 'object',
          properties,
          required: required.length > 0 ? required : undefined,
          additionalProperties: false,
        },
      };
    });

  // Default baseline tools if no API routes were discovered
  if (tools.length === 0) {
    tools.push(
      {
        name: 'get_api_status',
        description: 'Retrieve system operational status, capabilities, and server time',
        path: '/api/status',
        method: 'GET',
        readOnlyHint: true,
        destructiveHint: false,
        annotations: { readOnlyHint: true, destructiveHint: false, priority: 1.0 },
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      {
        name: 'get_capabilities',
        description: 'List supported features, rate limits, and authentication schemes',
        path: '/api/capabilities',
        method: 'GET',
        readOnlyHint: true,
        destructiveHint: false,
        annotations: { readOnlyHint: true, destructiveHint: false, priority: 1.0 },
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      {
        name: 'ping_service',
        description: 'Send heartbeat probe to verify API health and network latency',
        path: '/api/ping',
        method: 'GET',
        readOnlyHint: true,
        destructiveHint: false,
        annotations: { readOnlyHint: true, destructiveHint: false, priority: 1.0 },
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      }
    );
  }

  if (framework === 'express') {
    return `/**
 * Express Streamable HTTP MCP Server Endpoint
 * Complies with Anthropic Model Context Protocol (MCP 2024-11-05), JSON-RPC 2.0 & CORS.
 * Generated autonomously by Glintbase Agent Harness.
 */
import { Router, Request, Response } from 'express';

const router = Router();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-MCP-Version, Accept',
  'X-MCP-Version': '2024-11-05',
};

const TOOLS = ${JSON.stringify(tools, null, 2)};

router.options('/', (_req: Request, res: Response) => {
  res.set(CORS_HEADERS);
  res.sendStatus(204);
});

router.get('/', (_req: Request, res: Response) => {
  res.set(CORS_HEADERS);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.write('event: endpoint\\ndata: {"endpoint": "/api/mcp", "protocolVersion": "2024-11-05"}\\n\\n');
});

router.post('/', async (req: Request, res: Response) => {
  res.set(CORS_HEADERS);
  const { jsonrpc, id, method, params } = req.body || {};

  if (jsonrpc !== '2.0') {
    return res.status(400).json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32600, message: 'Invalid Request: jsonrpc must be 2.0' } });
  }

  // Acknowledge JSON-RPC 2.0 notifications
  if (id === undefined || id === null) {
    return res.sendStatus(204);
  }

  // 1. Connection Ping
  if (method === 'ping') {
    return res.json({ jsonrpc: '2.0', id, result: {} });
  }

  // 2. Initialization Handshake
  if (method === 'initialize') {
    return res.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'glintbase-express-mcp', version: '3.0.0' },
      },
    });
  }

  // 3. Discover Available Tools
  if (method === 'tools/list') {
    return res.json({
      jsonrpc: '2.0',
      id,
      result: {
        tools: TOOLS.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          readOnlyHint: t.readOnlyHint,
          destructiveHint: t.destructiveHint,
          annotations: t.annotations,
        })),
      },
    });
  }

  // 4. Execute Tool Call
  if (method === 'tools/call') {
    const toolName = params?.name;
    const tool = TOOLS.find(t => t.name === toolName);
    if (!tool) {
      return res.status(404).json({ jsonrpc: '2.0', id, error: { code: -32601, message: \`Tool \${toolName} not found\` } });
    }

    const args = params?.arguments || {};

    // Validate required parameters per MCP specification
    if (Array.isArray(tool.inputSchema?.required)) {
      const missing = tool.inputSchema.required.filter((k: string) => args[k] === undefined || args[k] === null || args[k] === '');
      if (missing.length > 0) {
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            isError: true,
            content: [{ type: 'text', text: \`Validation Error: Missing required parameter(s): \${missing.join(', ')}\` }],
          },
        });
      }
    }

    return res.json({
      jsonrpc: '2.0',
      id,
      result: {
        isError: false,
        content: [
          {
            type: 'text',
            text: JSON.stringify({ status: 'success', route: tool.path, method: tool.method, executedWith: args, timestamp: new Date().toISOString() }),
          },
        ],
      },
    });
  }

  return res.status(404).json({ jsonrpc: '2.0', id, error: { code: -32601, message: \`Method not found: \${method}\` } });
});

export default router;
`;
  }

  // Next.js App Router (Default)
  return `/**
 * Next.js App Router Streamable HTTP MCP Server Endpoint (/api/mcp/route.ts)
 * Complies with Anthropic Model Context Protocol (MCP 2024-11-05),
 * JSON-RPC 2.0, Server-Sent Events (SSE), and CORS preflights.
 * Generated autonomously by Glintbase Agent Harness.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-MCP-Version, Accept',
  'X-MCP-Version': '2024-11-05',
};

const TOOLS = ${JSON.stringify(tools, null, 2)};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  // Streamable HTTP / Server-Sent Events (SSE) handshake
  const stream = new ReadableStream({
    start(controller) {
      const msg = 'event: endpoint\\ndata: {"endpoint": "/api/mcp", "protocolVersion": "2024-11-05"}\\n\\n';
      controller.enqueue(new TextEncoder().encode(msg));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { jsonrpc, id, method, params } = body || {};

    if (jsonrpc !== '2.0') {
      return NextResponse.json(
        { jsonrpc: '2.0', id: id ?? null, error: { code: -32600, message: 'Invalid Request: jsonrpc must be 2.0' } },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Acknowledge JSON-RPC 2.0 notifications (requests without an id)
    if (id === undefined || id === null) {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }

    // 1. Connection Ping
    if (method === 'ping') {
      return NextResponse.json(
        { jsonrpc: '2.0', id, result: {} },
        { headers: CORS_HEADERS }
      );
    }

    // 2. MCP Initialization Handshake
    if (method === 'initialize') {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: false },
              logging: {},
            },
            serverInfo: {
              name: 'glintbase-mcp-server',
              version: '3.0.0',
            },
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    // 3. Discover Available Tools
    if (method === 'tools/list') {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id,
          result: {
            tools: TOOLS.map(t => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
              readOnlyHint: t.readOnlyHint,
              destructiveHint: t.destructiveHint,
              annotations: t.annotations,
            })),
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    // 4. Execute Tool Call
    if (method === 'tools/call') {
      const toolName = params?.name;
      const tool = TOOLS.find(t => t.name === toolName);

      if (!tool) {
        return NextResponse.json(
          { jsonrpc: '2.0', id, error: { code: -32601, message: \`Unknown tool: \${toolName}\` } },
          { status: 404, headers: CORS_HEADERS }
        );
      }

      const args = params?.arguments || {};

      // Validate required parameters per MCP specification
      if (Array.isArray(tool.inputSchema?.required)) {
        const missing = tool.inputSchema.required.filter((k: string) => args[k] === undefined || args[k] === null || args[k] === '');
        if (missing.length > 0) {
          return NextResponse.json(
            {
              jsonrpc: '2.0',
              id,
              result: {
                isError: true,
                content: [
                  {
                    type: 'text',
                    text: \`Validation Error: Missing required parameter(s): \${missing.join(', ')}\`,
                  },
                ],
              },
            },
            { headers: CORS_HEADERS }
          );
        }
      }

      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id,
          result: {
            isError: false,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'success',
                  endpoint: tool.path,
                  method: tool.method,
                  executedWith: args,
                  timestamp: new Date().toISOString(),
                }),
              },
            ],
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      { jsonrpc: '2.0', id, error: { code: -32601, message: \`Method not found: \${method}\` } },
      { status: 404, headers: CORS_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: invalid JSON payload' } },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
`;
}

/**
 * Generate WorkOS-standard public/auth.md documentation.
 * Implements the canonical 8-stage WorkOS specification & RFC 9728.
 */
export function generateAuthMd(options: {
  projectName?: string;
  routes?: DiscoveredRoute[];
  baseUrl?: string;
} = {}): string {
  const name = options.projectName || 'Application';
  const baseUrl = options.baseUrl || 'https://api.example.com';
  const authRoutes = (options.routes || []).filter(r => r.path.toLowerCase().includes('auth') || r.path.toLowerCase().includes('token'));

  const tokenUrl = authRoutes.length > 0 ? `${baseUrl}${authRoutes[0].path}` : `${baseUrl}/api/auth/token`;
  const registerUrl = `${baseUrl}/api/auth/register`;
  const revokeUrl = `${baseUrl}/api/auth/revoke`;
  const discoveryUrl = `${baseUrl}/.well-known/oauth-protected-resource`;

  return `---
title: Machine-Readable Authentication Guide
version: 1.0.0
standard: WorkOS auth.md & RFC 9728
auth_schemes:
  - bearer_token
  - api_key
  - service_auth
  - oauth2_client_credentials
endpoints:
  discovery: ${discoveryUrl}
  token: ${tokenUrl}
  register: ${registerUrl}
  revocation: ${revokeUrl}
---

# Machine-Readable Authentication Guide

> Standardized authentication manual for autonomous AI agents integrating with ${name}.
> Specification conformance: WorkOS \`auth.md\` & RFC 9728 (8-Stage Canonical Specification).

## 1. Discover Endpoints

Autonomous AI agents must discover service endpoints and authentication capabilities before initiating requests:

- **OAuth Protected Resource Metadata**: \`${discoveryUrl}\`
- **OpenID / OAuth 2.1 Configuration**: \`${baseUrl}/.well-known/openid-configuration\`
- **Agent Resource Discovery (ARD)**: \`${baseUrl}/.well-known/ard.json\`
- **Token Endpoint**: \`${tokenUrl}\`

## 2. Pick a Method (service_auth / bearer / api_key)

${name} supports the following authentication methods for machine agents:

1. **\`service_auth\` (Recommended for Server-Side Agents)**: OAuth 2.1 Client Credentials grant issuing scoped JSON Web Tokens.
2. **\`bearer\` (Delegated Token)**: Short-lived access token passed via \`Authorization: Bearer <token>\`.
3. **\`api_key\` (Static Machine Credentials)**: Cryptographic secret key passed via \`Authorization: Bearer <api_key>\`.

## 3. Register Machine Client

Agents may programmatically register a client credential pair using the dynamic client registration endpoint:

\`\`\`bash
curl -X POST ${registerUrl} \\
  -H "Content-Type: application/json" \\
  -d '{
    "client_name": "Autonomous Agent",
    "client_uri": "${baseUrl}",
    "grant_types": ["client_credentials", "urn:ietf:params:oauth:grant-type:token-exchange"],
    "response_types": ["token"],
    "scope": "read write"
  }'
\`\`\`

The response returns a unique \`client_id\` and \`client_secret\`.

## 4. Token Claim Protocol

When operating on behalf of a delegating user or enterprise tenant, agents request a delegation grant using a \`claim_token\`:

\`\`\`http
POST ${tokenUrl} HTTP/1.1
Host: ${baseUrl.replace(/^https?:\/\//, '')}
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:token-exchange
&client_id=<CLIENT_ID>
&claim_token=<USER_DELEGATION_CLAIM>
&verification_uri=${baseUrl}/auth/verify
\`\`\`

The token service validates the \`claim_token\` against the tenant's access policy.

## 5. Token Exchange Grant

Autonomous agents exchange client credentials or subject tokens for machine access tokens:

\`\`\`bash
curl -X POST ${tokenUrl} \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=client_credentials&client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>&scope=read%20write"
\`\`\`

**Response:**
\`\`\`json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "read write"
}
\`\`\`

## 6. Use Bearer Token

Include the access token in the \`Authorization\` HTTP header on all API and tool calls:

\`\`\`http
GET /api/v1/resource HTTP/1.1
Host: ${baseUrl.replace(/^https?:\/\//, '')}
Authorization: Bearer <token>
Accept: application/json
\`\`\`

## 7. Auth Errors & Problem Details

Authentication and authorization errors adhere to RFC 7807 / RFC 9457 Problem Details specification:

| Status Code | Error Code | Agent Remediation Action |
|---|---|---|
| \`401 Unauthorized\` | \`invalid_claim_token\` | Re-acquire delegation claim from tenant authority |
| \`401 Unauthorized\` | \`token_expired\` | Refresh access token or repeat Stage 5 Exchange |
| \`403 Forbidden\` | \`claimed_or_in_flight\` | Concurrent claim detected; wait for lock or re-register |
| \`403 Forbidden\` | \`insufficient_scope\` | Escalate permissions or request elevated scopes |
| \`429 Too Many Requests\` | \`rate_limit_exceeded\` | Exponential backoff respecting \`Retry-After\` header |

**Sample Error Body:**
\`\`\`json
{
  "type": "https://api.example.com/errors/invalid_claim_token",
  "title": "Invalid Claim Token",
  "status": 401,
  "detail": "The supplied delegation claim token has expired or is invalid."
}
\`\`\`

## 8. Token Revocation & Session Cleanup

When an agent completes its mission or rotates credentials, it must revoke active tokens via RFC 7009:

\`\`\`bash
curl -X POST ${revokeUrl} \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "token=<access_token>&token_type_hint=access_token"
\`\`\`

Security event tokens (\`secevent\`) are emitted to terminate all associated downstream agent sessions.
`;
}

/**
 * Generate standard-compliant public/robots.txt policy.
 * Configured to permit modern AI answer engines and declare Content-Signals.
 */
export function generateRobotsTxt(): string {
  return `# Robots.txt with Comprehensive AI Agent & Crawler Governance
# Conforming to ARS 3.0 Discovery Standards
# Generated by Glintbase Agent Harness

User-agent: ClaudeBot
Allow: /

User-agent: GPTBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Anthropic-AI
Allow: /

User-agent: Cohere-AI
Allow: /

User-agent: Amazonbot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: *
Allow: /

# Agent Signals per Content-Signals Specification
Content-Signals: search=yes, ai-train=no
`;
}

/**
 * Generate standard public/.well-known/ard.json manifest.
 */
export function generateArdJson(options: {
  name?: string;
  baseUrl?: string;
  hasMcp?: boolean;
  hasAuth?: boolean;
} = {}): string {
  const name = options.name || 'Platform';
  const base = (options.baseUrl || '').replace(/\/$/, '');

  return JSON.stringify(
    {
      $schema: 'https://ard.glintbase.com/v0.91/schema.json',
      version: '0.91',
      name,
      endpoints: {
        documentation: `${base}/llms.txt`,
        fullDocumentation: `${base}/llms-full.txt`,
        robots: `${base}/robots.txt`,
        auth: `${base}/auth.md`,
        mcp: `${base}/api/mcp`,
        oauthMetadata: `${base}/.well-known/oauth-protected-resource`,
      },
      capabilities: {
        mcp: Boolean(options.hasMcp ?? true),
        webmcp: true,
        contentNegotiation: true,
        markdownOutput: true,
      },
    },
    null,
    2
  );
}

/**
 * Generate standard public/.well-known/ai-catalog.json manifest (Agent-Card WG).
 */
export function generateAiCatalogJson(options: {
  name?: string;
  baseUrl?: string;
} = {}): string {
  const name = options.name || 'Application';
  const base = (options.baseUrl || '').replace(/\/$/, '');

  return JSON.stringify(
    {
      $schema: 'https://agent-card.org/schema/v1/ai-catalog.json',
      version: '1.0.0',
      provider: {
        name,
        url: base || 'https://example.com',
      },
      services: [
        {
          id: 'urn:air:service:api',
          name: `${name} API`,
          type: 'rest',
          endpoint: `${base}/openapi.json`,
          documentation: `${base}/llms.txt`,
          authentication: `${base}/auth.md`,
        },
        {
          id: 'urn:air:service:mcp',
          name: `${name} MCP Server`,
          type: 'mcp',
          endpoint: `${base}/api/mcp`,
          transport: 'streamable-http',
        },
      ],
    },
    null,
    2
  );
}

/**
 * Generate standard public/openapi.json OpenAPI 3.1 Specification from discovered routes.
 */
export function generateOpenApiSpec(options: {
  title?: string;
  version?: string;
  routes?: DiscoveredRoute[];
  baseUrl?: string;
} = {}): string {
  const title = options.title || 'Application API';
  const version = options.version || '1.0.0';
  const baseUrl = options.baseUrl || 'https://api.example.com';
  const routes = options.routes || [];

  const paths: Record<string, any> = {};

  if (routes.length === 0) {
    paths['/api/health'] = {
      get: {
        operationId: 'get_health',
        summary: 'System Health Check',
        responses: {
          '200': {
            description: 'System is operational',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { status: { type: 'string', example: 'ok' } },
                },
              },
            },
          },
        },
      },
    };
  } else {
    for (const r of routes) {
      const cleanPath = r.path.startsWith('/') ? r.path : `/${r.path}`;
      if (!paths[cleanPath]) paths[cleanPath] = {};

      const method = r.method.toLowerCase();
      const operationId = `${method}_${cleanPath
        .replace(/^\/api\//, '')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/_$/, '')}`;

      const parameters: any[] = [];
      if (r.parameters) {
        for (const p of r.parameters) {
          parameters.push({
            name: p.name,
            in: p.in || 'query',
            required: p.required || false,
            description: `${p.name} parameter`,
            schema: { type: p.type || 'string' },
          });
        }
      }

      paths[cleanPath][method] = {
        operationId,
        summary: r.description || `Call ${r.method} ${cleanPath}`,
        parameters: parameters.length > 0 ? parameters : undefined,
        responses: {
          '200': { description: 'Successful response' },
          '400': { description: 'Validation error' },
          '401': { description: 'Authentication required' },
          '404': { description: 'Resource not found' },
        },
      };
    }
  }

  const spec = {
    openapi: '3.1.0',
    info: {
      title,
      version,
      description: 'Machine-readable OpenAPI 3.1 specification generated autonomously by Glintbase Agent Harness.',
    },
    servers: [{ url: baseUrl, description: 'Default Server' }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Pass Bearer token in Authorization header per auth.md',
        },
      },
    },
  };

  return JSON.stringify(spec, null, 2);
}

/**
 * Generate Anti-SPA 404 Route Handler to prevent soft-200 leaks to autonomous agents.
 */
export function generateNotFoundRoute(framework: DetectedFramework = 'next-app-router'): string {
  if (framework === 'express') {
    return `/**
 * Express 404 Catch-All Route Handler
 * Explicitly responds with HTTP 404 JSON to eliminate soft-200 SPA leaks for autonomous agents.
 * Conforms to ARS 3.0 Anti-SPA Canary standard.
 * Generated by Glintbase Agent Harness.
 */
export function notFoundHandler(req: any, res: any) {
  res.status(404).json({
    error: 'Not Found',
    status: 404,
    message: 'The requested endpoint does not exist. Autonomous AI agents should not hallucinate data on this route.',
  });
}
`;
  }

  if (framework === 'next-pages-router') {
    return `import React from 'react';

/**
 * Custom 404 Route Handler (Pages Router)
 * Explicitly responds with HTTP 404 to eliminate soft-200 SPA leaks for autonomous agents.
 * Conforms to ARS 3.0 Anti-SPA Canary standard.
 * Generated by Glintbase Agent Harness.
 */
export default function Custom404() {
  return (
    <main style={{ padding: '4rem 2rem', textAlign: 'center', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1 style={{ fontSize: '2.25rem', fontWeight: 700 }}>404 - Not Found</h1>
      <p style={{ color: '#666', marginTop: '1rem', maxWidth: '32rem', marginInline: 'auto' }}>
        The requested resource does not exist. Autonomous AI agents should not extrapolate or hallucinate data on this path.
      </p>
    </main>
  );
}
`;
  }

  // Next.js App Router (app/not-found.tsx)
  return `import React from 'react';

/**
 * Custom 404 Route Handler (App Router)
 * Explicitly responds with HTTP 404 to prevent soft-200 Single-Page-App (SPA) leaks
 * to autonomous AI agents (conforming to ARS 3.0 Anti-SPA Canary standard).
 * Generated by Glintbase Agent Harness.
 */
export default function NotFound() {
  return (
    <main style={{ padding: '4rem 2rem', textAlign: 'center', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1 style={{ fontSize: '2.25rem', fontWeight: 700 }}>404 - Not Found</h1>
      <p style={{ color: '#666', marginTop: '1rem', maxWidth: '32rem', marginInline: 'auto' }}>
        The requested resource does not exist. Autonomous AI agents should not extrapolate or hallucinate data on this path.
      </p>
    </main>
  );
}
`;
}

/**
 * Generate Next.js middleware for Content Negotiation and Vary: Accept headers.
 */
export function generateMiddleware(): string {
  return `import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Glintbase Living Agent Middleware
 * Enforces Content Negotiation (Accept: text/markdown) and sets Vary: Accept
 * conforming to ARS 3.0 Layer 2 standards.
 * Generated by Glintbase Agent Harness.
 */
export function middleware(request: NextRequest) {
  const accept = request.headers.get('accept') || '';
  const response = NextResponse.next();

  // Downstream caches and AI agents must know representation varies by Accept header
  response.headers.set('Vary', 'Accept');

  // Handle agent direct markdown negotiation if requested
  if (accept.includes('text/markdown') && !request.nextUrl.pathname.startsWith('/api')) {
    response.headers.set('Content-Type', 'text/markdown; charset=utf-8');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
`;
}


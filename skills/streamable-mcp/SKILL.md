---
name: streamable-mcp
description: Production architecture for deploying streamable HTTP MCP routes under Anthropic MCP standard.
---

# Streamable HTTP MCP Server Builder

Model Context Protocol (MCP 2024-11-05) supports **Streamable HTTP transport** over `/api/mcp` (or `/sse`), enabling coding agents to discover and invoke tools with low latency and streaming progress.

## Next.js App Router Route Handler (`app/api/mcp/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-MCP-Version, Accept',
  'X-MCP-Version': '2024-11-05',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { jsonrpc, method, params, id } = body;

  if (jsonrpc !== '2.0') {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: id ?? null },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (method === 'initialize') {
    return NextResponse.json({
      jsonrpc: '2.0',
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'api-mcp-server', version: '3.0.0' }
      },
      id
    }, { headers: CORS_HEADERS });
  }

  if (method === 'tools/list') {
    return NextResponse.json({
      jsonrpc: '2.0',
      result: {
        tools: [
          {
            name: 'get_status',
            description: 'Fetch system health and active services status.',
            inputSchema: { type: 'object', properties: {} },
            readOnlyHint: true
          }
        ]
      },
      id
    }, { headers: CORS_HEADERS });
  }

  return NextResponse.json(
    { jsonrpc: '2.0', error: { code: -32601, message: `Method not found: ${method}` }, id },
    { status: 404, headers: CORS_HEADERS }
  );
}
```

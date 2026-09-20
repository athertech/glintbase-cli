/**
 * Glintbase MCP Server Engine (ARS 3.0)
 *
 * Implements the Anthropic Model Context Protocol server exposing:
 * - 13 glintbase_* agent tools
 * - 8 bundled skills as Prompts & Resources
 * - Dual transport: Stdio (default for Cursor/Claude Code) & Streamable HTTP SSE
 */

import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { registerSkillPromptsAndResources } from './skills/index.js';
import { registerAllTools } from './tools/index.js';

export function createGlintbaseMcpServer(): McpServer {
  const server = new McpServer({
    name: 'glintbase',
    version: '3.0.0',
  });

  // 1. Register 8 Bundled Skills as MCP Prompts & Resources
  registerSkillPromptsAndResources(server);

  // 2. Register 13 Core Tools
  registerAllTools(server);

  return server;
}

/**
 * Start Stdio Server Transport for local IDE integration (Cursor, Windsurf, Claude Code).
 */
export async function startMcpStdio(server: McpServer = createGlintbaseMcpServer()): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * Start Streamable HTTP SSE Server Transport for remote agents or containerized runners.
 */
export async function startMcpHttp(
  port = 3001,
  server: McpServer = createGlintbaseMcpServer()
): Promise<http.Server> {
  let transport: SSEServerTransport | null = null;

  const httpServer = http.createServer(async (req, res) => {
    // CORS headers for all incoming requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-MCP-Version, Accept');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/mcp' || url.pathname === '/sse') {
      if (req.method === 'POST') {
        if (!transport) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'SSE connection not established yet. Connect via GET first.' }));
          return;
        }
        await transport.handlePostMessage(req, res);
        return;
      }
      // GET establishes SSE stream
      transport = new SSEServerTransport('/mcp', res);
      await server.connect(transport);
      return;
    }

    if (url.pathname === '/message' && req.method === 'POST') {
      if (!transport) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'SSE connection not established yet. Connect to /mcp first.' }));
        return;
      }
      await transport.handlePostMessage(req, res);
      return;
    }

    // Health check endpoint
    if (url.pathname === '/health' || url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          server: 'glintbase-mcp',
          version: '3.0.0',
          spec: '2024-11-05',
          endpoint: '/mcp',
          endpoints: {
            mcp: '/mcp',
            sse: '/sse',
            message: '/message',
          },
        })
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return new Promise((resolve, reject) => {
    httpServer.listen(port, () => {
      resolve(httpServer);
    });
    httpServer.on('error', reject);
  });
}

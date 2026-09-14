import { describe, it, expect } from 'vitest';
import { generateMcpRoute } from '../src/ast/generators.js';
import { getWebMcpComponentTemplate } from '../src/ast/injector.js';
import { ArsSandbox } from '../src/core/sandbox.js';
import type { DiscoveredRoute } from '../src/ast/routeScanner.js';

describe('Enterprise MCP & WebMCP Generation Mechanisms', () => {
  const sampleRoutes: DiscoveredRoute[] = [
    {
      path: '/api/users/[id]',
      method: 'GET',
      file: 'app/api/users/[id]/route.ts',
      description: 'Get user profile by unique ID',
      parameters: [{ name: 'id', in: 'path', required: true, type: 'string' }],
      framework: 'next-app-router'
    },
    {
      path: '/api/billing/charge',
      method: 'POST',
      file: 'app/api/billing/charge/route.ts',
      description: 'Charge customer credit card',
      parameters: [
        { name: 'amount_cents', in: 'body', required: true, type: 'number' },
        { name: 'currency', in: 'body', required: true, type: 'string' }
      ],
      framework: 'next-app-router'
    }
  ];

  describe('Next.js App Router MCP Server Route (/api/mcp/route.ts)', () => {
    it('generates fully compliant Streamable HTTP MCP handler with CORS preflight', () => {
      const code = generateMcpRoute(sampleRoutes, 'next-app-router');

      // 1. Export signatures
      expect(code).toContain('export async function OPTIONS()');
      expect(code).toContain('export async function GET()');
      expect(code).toContain('export async function POST(req: Request)');

      // 2. CORS headers
      expect(code).toContain("'Access-Control-Allow-Origin': '*'");
      expect(code).toContain("'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'");
      expect(code).toContain("'X-MCP-Version': '2024-11-05'");

      // 3. JSON-RPC ping support
      expect(code).toContain("if (method === 'ping')");

      // 4. Initialization handshake
      expect(code).toContain("if (method === 'initialize')");
      expect(code).toContain("protocolVersion: '2024-11-05'");

      // 5. Tools list & Safety hints
      expect(code).toContain("if (method === 'tools/list')");
      expect(code).toContain('"readOnlyHint": true');
      expect(code).toContain('"destructiveHint": true');
      expect(code).toContain('"additionalProperties": false');

      // 6. Parameter validation & MCP isError representation
      expect(code).toContain('isError: true');
      expect(code).toContain('Validation Error: Missing required parameter(s)');
    });

    it('generates fallback baseline tools when no API routes are discovered', () => {
      const code = generateMcpRoute([], 'next-app-router');
      expect(code).toContain('get_api_status');
      expect(code).toContain('get_capabilities');
      expect(code).toContain('ping_service');
      expect(code).toContain('"readOnlyHint": true');
    });
  });

  describe('Express MCP Server Router (routes/mcp.ts)', () => {
    it('generates compliant Express router with CORS, ping, and validation', () => {
      const code = generateMcpRoute(sampleRoutes, 'express');

      expect(code).toContain("import { Router, Request, Response } from 'express'");
      expect(code).toContain("router.options('/',");
      expect(code).toContain("router.get('/',");
      expect(code).toContain("router.post('/',");
      expect(code).toContain("if (method === 'ping')");
      expect(code).toContain('isError: true');
      expect(code).toContain('"readOnlyHint": true');
      expect(code).toContain('"destructiveHint": true');
    });
  });

  describe('Browser-Native WebMCP Component (WebMcpProvider.tsx)', () => {
    it('generates TypeScript WebMCP component with registerTool API and event dispatch', () => {
      const code = getWebMcpComponentTemplate(true);

      expect(code).toContain('export function WebMcpProvider');
      expect(code).toContain('window.modelContext = modelContextInstance');
      expect(code).toContain('(document as any).modelContext = modelContextInstance');
      expect(code).toContain('registerTool: (tool: WebMcpTool)');
      expect(code).toContain("window.dispatchEvent(new CustomEvent('modelContextReady'");
      expect(code).toContain('get_page_metadata');
      expect(code).toContain('get_interactive_elements');
      expect(code).toContain('get_page_headings');
      expect(code).toContain('interface ModelContext');
    });

    it('generates plain JavaScript WebMCP component version', () => {
      const code = getWebMcpComponentTemplate(false);

      expect(code).toContain('export function WebMcpProvider({ children })');
      expect(code).toContain('window.modelContext = modelContextInstance');
      expect(code).toContain('registerTool: (tool)');
      expect(code).toContain("window.dispatchEvent(new CustomEvent('modelContextReady'");
    });
  });

  describe('ArsSandbox Verification of Generated Artifacts', () => {
    it('passes sandbox verification for hardened MCP route and WebMCP provider', () => {
      const sandbox = new ArsSandbox();

      const mcpRoute = generateMcpRoute(sampleRoutes, 'next-app-router');
      const webMcp = getWebMcpComponentTemplate(true);

      const mcpVerify = sandbox.verifyArtifact({
        targetPath: 'app/api/mcp/route.ts',
        content: mcpRoute,
        action: 'create',
        rationale: 'Generated MCP route',
        pointsImpact: 20,
        layer: 'usability'
      });

      expect(mcpVerify.passed).toBe(true);
      expect(mcpVerify.errors.length).toBe(0);
      expect(mcpVerify.diagnostics).toContain('Streamable HTTP MCP route export signatures verified');
      expect(mcpVerify.diagnostics).toContain('MCP JSON-RPC 2.0 initialize and tools/list methods verified');
      expect(mcpVerify.diagnostics).toContain('MCP cross-origin CORS preflight headers verified');

      const webMcpVerify = sandbox.verifyArtifact({
        targetPath: 'components/WebMcpProvider.tsx',
        content: webMcp,
        action: 'create',
        rationale: 'Generated WebMCP provider',
        pointsImpact: 15,
        layer: 'usability'
      });

      expect(webMcpVerify.passed).toBe(true);
      expect(webMcpVerify.errors.length).toBe(0);
      expect(webMcpVerify.diagnostics).toContain('WebMCP window.modelContext registration verified');
      expect(webMcpVerify.diagnostics).toContain('WebMCP dynamic registerTool() API verified');
      expect(webMcpVerify.diagnostics).toContain('WebMCP modelContextReady event dispatch verified');
    });
  });
});

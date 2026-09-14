/**
 * MCP & WebMCP Subagent for Layer 3.
 * Generates Streamable HTTP MCP routes, client configurations, and WebMCP provider components.
 */

import { BaseSubagent } from './base.js';
import type { ProposedArtifact, SubagentContext } from '../types.js';
import { generateMcpRoute } from '../../ast/generators.js';
import { getWebMcpComponentTemplate } from '../../ast/injector.js';

export class McpWebMcpSubagent extends BaseSubagent {
  public readonly id = 'mcp-webmcp-subagent';
  public readonly layer = 'usability' as const;
  public readonly name = 'MCP & WebMCP Subagent';

  public async generateArtifacts(
    context: SubagentContext,
    diagnosticFeedback?: string
  ): Promise<ProposedArtifact[]> {
    const artifacts: ProposedArtifact[] = [];
    const name = context.projectName || 'API Platform';
    const serverKey = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const domainUrl = context.domainUrl || 'http://localhost:3000';

    // 1. Generate mcp.json config
    const mcpJsonContent = JSON.stringify(
      {
        mcpServers: {
          [serverKey]: {
            url: `${domainUrl.replace(/\/$/, '')}/api/mcp`,
            transport: 'sse',
          },
        },
      },
      null,
      2
    );

    artifacts.push({
      targetPath: 'mcp.json',
      action: 'create',
      content: mcpJsonContent,
      rationale: 'Client configuration for Claude Desktop, Cursor, and Windsurf',
      pointsImpact: 10,
      layer: 'usability',
    });

    // 2. Generate Streamable HTTP MCP Server Route from Discovered AST Routes
    const mcpRouteContent = generateMcpRoute(context.routes || [], (context.framework as any) || 'next-app-router');

    artifacts.push({
      targetPath: context.framework === 'express' ? 'src/routes/mcp.ts' : 'app/api/mcp/route.ts',
      action: 'create',
      content: mcpRouteContent,
      rationale: 'Streamable HTTP / SSE MCP server route handler derived from workspace AST',
      pointsImpact: 15,
      layer: 'usability',
    });

    // 3. Generate WebMCP Provider Component
    const webMcpContent = getWebMcpComponentTemplate(true);

    artifacts.push({
      targetPath: 'components/WebMcpProvider.tsx',
      action: 'create',
      content: webMcpContent,
      rationale: 'Standalone WebMCP browser instrumentation provider component',
      pointsImpact: 10,
      layer: 'usability',
    });

    return artifacts;
  }
}

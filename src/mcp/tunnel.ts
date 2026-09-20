/**
 * Glintbase Zero-Config Tunneling for Remote MCP Clients
 * Automatically provisions an ephemeral Cloudflare Quick Tunnel (via untun)
 * exposing the local Glintbase MCP SSE server to Claude Desktop, ChatGPT, etc.
 */

import { startTunnel } from 'untun';
import pc from 'picocolors';

export interface McpTunnelSession {
  publicUrl: string;
  mcpUrl: string;
  sseUrl: string;
  close: () => Promise<void>;
}

export async function establishMcpTunnel(localPort: number): Promise<McpTunnelSession> {
  const tunnel = await startTunnel({
    url: `http://127.0.0.1:${localPort}`,
  });

  if (!tunnel) {
    throw new Error('Failed to initialize Cloudflare Quick Tunnel.');
  }

  const rawUrl = await tunnel.getURL();
  const cleanBase = (rawUrl || '').replace(/\/+$/, '');
  const mcpUrl = `${cleanBase}/mcp`;

  return {
    publicUrl: cleanBase,
    mcpUrl,
    sseUrl: mcpUrl,
    close: async () => {
      try {
        await tunnel.close();
      } catch {
        // Ignored on teardown
      }
    },
  };
}

export function formatTunnelInstructions(mcpUrl: string): string {
  const border = '═'.repeat(66);
  return `
${pc.bold(pc.red(border))}
  ${pc.bold(pc.white('🚀 GLINTBASE REMOTE MCP SERVER ACTIVE'))}
${pc.bold(pc.red(border))}

  ${pc.green('●')} Public MCP Connector:
    ${pc.bold(pc.cyan(mcpUrl))}

  ${pc.bold(pc.white('Claude Desktop / Cursor / ChatGPT Config:'))}
  Add this to your client's MCP configuration:
  ${pc.dim('------------------------------------------------------------------')}
  {
    "mcpServers": {
      "glintbase": {
        "url": "${mcpUrl}"
      }
    }
  }
  ${pc.dim('------------------------------------------------------------------')}
  ${pc.yellow('Press Ctrl+C to disconnect tunnel and stop the server.')}
`;
}

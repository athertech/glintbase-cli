/**
 * CLI Command: glintbase mcp
 * Launches the Glintbase Model Context Protocol (MCP) server for AI coding agents.
 *
 * Transports:
 * - Default: Stdio transport (for Claude Code, Cursor, Windsurf)
 * - Flag --http: Streamable HTTP SSE transport (for remote agents, Docker, webhooks)
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { createGlintbaseMcpServer, startMcpStdio, startMcpHttp } from '../mcp/server.js';
import { brand, renderCommandHeader } from '../output/banner.js';

export const mcpCommand = new Command('mcp')
  .description('Launch the Glintbase MCP Server for AI coding agents (Cursor, Claude Code, Windsurf)')
  .option('--http', 'Run as a Streamable HTTP SSE server instead of Stdio')
  .option('-p, --port <number>', 'Port for HTTP SSE server (default: 3001)', '3001')
  .action(async (options) => {
    const server = createGlintbaseMcpServer();

    if (options.http) {
      const port = parseInt(options.port, 10) || 3001;
      renderCommandHeader('MCP SERVER (STREAMABLE HTTP SSE)', `http://localhost:${port}/sse`);

      console.log(`  ${pc.bold('Protocol')}  : ${pc.cyan('Anthropic Model Context Protocol (MCP 2024-11-05)')}`);
      console.log(`  ${pc.bold('SSE Url')}   : ${pc.green(`http://localhost:${port}/sse`)}`);
      console.log(`  ${pc.bold('Message')}   : ${pc.green(`http://localhost:${port}/message`)}`);
      console.log(`  ${pc.bold('Tools')}     : ${brand.orangeBold('13 glintbase_* tools active')}`);
      console.log(`  ${pc.bold('Skills')}    : ${pc.cyan('8 Bundled Skills (Prompts & Resources)')}\n`);
      console.log(pc.dim(`  Ready for incoming connections. Press Ctrl+C to terminate.\n`));

      await startMcpHttp(port, server);
    } else {
      // Stdio transport: do NOT print banners to stdout! Stdout is exclusively reserved for JSON-RPC messages!
      // Any debug messages must go to stderr.
      process.stderr.write(`[glintbase-mcp] Starting Stdio transport with 13 tools and 8 skills...\n`);
      await startMcpStdio(server);
    }
  });

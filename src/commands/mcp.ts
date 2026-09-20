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
import { establishMcpTunnel, formatTunnelInstructions } from '../mcp/tunnel.js';
import { brand, renderCommandHeader } from '../output/banner.js';

export const mcpCommand = new Command('mcp')
  .description('Launch the Glintbase MCP Server for AI coding agents (Cursor, Claude Code, Windsurf, ChatGPT)')
  .option('--http', 'Run as a Streamable HTTP SSE server instead of Stdio')
  .option('-p, --port <number>', 'Port for HTTP SSE server (default: 3001)', '3001')
  .option('-s, --share', 'Create an ephemeral public Cloudflare Quick Tunnel for remote Claude Desktop, ChatGPT, etc.')
  .action(async (options) => {
    const server = createGlintbaseMcpServer();

    if (options.http || options.share) {
      const port = parseInt(options.port, 10) || 3001;

      if (options.share) {
        process.stdout.write(pc.dim('  Provisioning ephemeral Cloudflare Quick Tunnel...\n'));
        try {
          const tunnel = await establishMcpTunnel(port);
          console.log(formatTunnelInstructions(tunnel.mcpUrl));

          const cleanup = async () => {
            console.log(pc.yellow('\n  Closing tunnel and shutting down MCP server...'));
            await tunnel.close();
            process.exit(0);
          };

          process.on('SIGINT', cleanup);
          process.on('SIGTERM', cleanup);
        } catch (err: any) {
          console.error(pc.red(`  Failed to establish tunnel: ${err.message}`));
          console.log(pc.yellow(`  Falling back to local HTTP server on port ${port}`));
        }
      } else {
        renderCommandHeader('MCP SERVER (STREAMABLE HTTP)', `http://localhost:${port}/mcp`);

        console.log(`  ${pc.bold('Protocol')}  : ${pc.cyan('Anthropic Model Context Protocol (MCP 2024-11-05)')}`);
        console.log(`  ${pc.bold('Endpoint')} : ${pc.green(`http://localhost:${port}/mcp`)}`);
        console.log(`  ${pc.bold('Message')}   : ${pc.green(`http://localhost:${port}/message`)}`);
        console.log(`  ${pc.bold('Tools')}     : ${brand.orangeBold('17 glintbase_* tools active')}`);
        console.log(`  ${pc.bold('Skills')}    : ${pc.cyan('9 Bundled Skills (Prompts & Resources)')}\n`);
        console.log(pc.dim(`  Ready for incoming connections. Press Ctrl+C to terminate.\n`));
      }

      await startMcpHttp(port, server);
    } else {
      // Stdio transport: do NOT print banners to stdout! Stdout is exclusively reserved for JSON-RPC messages!
      // Any debug messages must go to stderr.
      process.stderr.write(`[glintbase-mcp] Starting Stdio transport with 17 tools and 9 skills...\n`);
      await startMcpStdio(server);
    }
  });

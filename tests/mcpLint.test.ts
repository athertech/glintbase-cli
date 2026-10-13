import { describe, it, expect, vi, afterEach } from 'vitest';
import { mcpCommand } from '../src/commands/mcp.js';
import { mcpLintCommand, formatMcpLintMarkdown } from '../src/commands/mcpLint.js';
import type { McpLiveProbeResult } from '@glintbase/scanner-core';

describe('glintbase mcp lint', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is registered as a subcommand of mcp, keeping mcp as the server launcher', () => {
    const names = mcpCommand.commands.map((c) => c.name());
    expect(names).toContain('lint');
    expect(mcpCommand.options.map((o) => o.long)).toContain('--http');
    const flags = mcpLintCommand.options.map((o) => o.long);
    expect(flags).toEqual(expect.arrayContaining(['--fail-under', '--json', '--ci']));
  });

  it('exits 2 for a URL rejected by the scan URL policy (no network call)', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as any);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(mcpLintCommand.parseAsync(['http://169.254.169.254/mcp', '--json'], { from: 'user' })).rejects.toThrow('exit:2');
    expect(exit).toHaveBeenCalledWith(2);
  });

  it('formats a CI markdown summary with the gate verdict', () => {
    const result = {
      live: true,
      endpoint: 'https://example.com/mcp',
      protocolVersion: '2026-07-28',
      reliabilityScore: 60,
      toolCount: 1,
      tools: [{ name: 'delete_item', readOnly: false, destructive: false, declaredRequiredCount: 1 }],
      steps: [{ step: 'handshake', passed: true, latencyMs: 12, message: 'ok | fine' }],
    } as unknown as McpLiveProbeResult;
    const md = formatMcpLintMarkdown('https://example.com/mcp', result, 80);
    expect(md).toContain('**60 / 100**');
    expect(md).toContain('gate ≥ 80: FAILED');
    expect(md).toContain('Handshake & Wire Negotiation');
    expect(md).toContain('ok \\| fine');
    expect(md).toContain('`delete_item`');
  });
});

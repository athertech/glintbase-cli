/**
 * CLI Command: glintbase mcp lint <url>
 * 4-step empirical MCP server lint & reliability gate, using probeMcpServer from
 * @glintbase/scanner-core (the prober behind the ARS 3.2 usability layer).
 * Audits 2026-07-28 wire forms, hidden auth gates, schema honesty,
 * destructive tool annotations, and in-channel error envelopes.
 *
 * Exit codes: 0 ok · 1 probe error · 2 invalid URL · 3 below --fail-under.
 */

import { Command, InvalidArgumentError } from 'commander';
import { appendFileSync } from 'fs';
import pc from 'picocolors';
import ora from 'ora';
import { probeMcpServer, validateScanUrl, type McpLiveProbeResult } from '@glintbase/scanner-core';

function parseThreshold(value: string): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new InvalidArgumentError('Expected an integer between 0 and 100.');
  }
  return n;
}

const STEP_TITLES: Record<string, string> = {
  handshake: 'Handshake & Wire Negotiation',
  tools_list: 'Tools Discovery & Schema Scan',
  safe_call: 'Safe Execution & Schema Honesty',
  error_channel: 'Error Channel Envelope Integrity',
};

function reliabilityLabel(score: number): string {
  return score >= 80 ? 'Production Ready' : score >= 50 ? 'Needs Remediation' : 'High Risk / Failing';
}

function destructiveWithoutHint(result: McpLiveProbeResult) {
  return result.tools.filter(
    (t) => (t.name.startsWith('delete_') || t.name.startsWith('drop_') || t.name.startsWith('remove_')) && !t.destructive
  );
}

/** Markdown summary for CI logs / $GITHUB_STEP_SUMMARY. */
export function formatMcpLintMarkdown(url: string, result: McpLiveProbeResult, failUnder?: number): string {
  const gate =
    failUnder === undefined
      ? ''
      : result.reliabilityScore >= failUnder
        ? ` · gate ≥ ${failUnder}: PASSED`
        : ` · gate ≥ ${failUnder}: FAILED`;
  const lines = [
    '## Glintbase MCP Lint',
    '',
    `**Target:** \`${url}\`  `,
    `**Protocol:** ${result.protocolVersion || 'Unknown / Legacy'}  `,
    `**Reliability score:** **${result.reliabilityScore} / 100** (${reliabilityLabel(result.reliabilityScore)})${gate}`,
    '',
    '| Step | Result | Latency | Notes |',
    '| :--- | :---: | ---: | :--- |',
    ...result.steps.map(
      (s) => `| ${STEP_TITLES[s.step] || s.step} | ${s.passed ? 'pass' : 'fail'} | ${s.latencyMs}ms | ${(s.message || '').replace(/\|/g, '\\|')} |`
    ),
    '',
    `Tools declared: ${result.toolCount}`,
  ];
  const risky = destructiveWithoutHint(result);
  if (risky.length > 0) {
    lines.push('', `Destructive tools without \`destructiveHint\`: ${risky.map((t) => `\`${t.name}\``).join(', ')}`);
  }
  return lines.join('\n') + '\n';
}

function appendGithubFile(path: string | undefined, content: string): void {
  if (!path) return;
  try {
    appendFileSync(path, content, 'utf8');
  } catch {
    /* ignore */
  }
}

export const mcpLintCommand = new Command('lint')
  .description('Audit a remote MCP server for protocol compliance, schema honesty, and reliability')
  .argument('<url>', 'MCP server endpoint URL (e.g. https://api.example.com/api/mcp)')
  .option('--fail-under <n>', 'Exit code 3 if MCP reliability score is below threshold', parseThreshold)
  .option('--json', 'Output raw JSON diagnostic report', false)
  .option('--ci', 'CI mode: outputs a markdown summary (also appended to $GITHUB_STEP_SUMMARY)', false)
  .action(async (rawUrl: string, opts: { failUnder?: number; json?: boolean; ci?: boolean }) => {
    const policy = validateScanUrl(rawUrl, { allowHttp: true });
    if (!policy.ok || !policy.url) {
      const reason = policy.message || 'URL rejected by the scan URL policy';
      if (opts.json) {
        console.log(JSON.stringify({ error: reason, code: policy.code, target: rawUrl }, null, 2));
      } else {
        console.error(pc.red(`\n✖ Invalid MCP endpoint "${rawUrl}": ${reason} (${policy.code})\n`));
      }
      process.exit(2);
    }
    const url = policy.url;
    const belowThreshold = (score: number) => opts.failUnder !== undefined && score < opts.failUnder;

    const spinner = ora({ text: pc.cyan(`Probing MCP server at ${url}...`), color: 'cyan' });
    if (!opts.json && !opts.ci) spinner.start();

    try {
      const result = await probeMcpServer(url);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        if (belowThreshold(result.reliabilityScore)) process.exit(3);
        return;
      }

      if (opts.ci) {
        const md = formatMcpLintMarkdown(url, result, opts.failUnder);
        console.log(md);
        appendGithubFile(process.env.GITHUB_STEP_SUMMARY, md);
        appendGithubFile(process.env.GITHUB_OUTPUT, `mcp_reliability_score=${result.reliabilityScore}\n`);
        if (belowThreshold(result.reliabilityScore)) process.exit(3);
        return;
      }

      spinner.stop();

      // Terminal Header
      console.log();
      console.log(pc.bold(pc.bgCyan(pc.black(' GLINTBASE MCP LINT '))) + pc.gray(' • Version 2026-07-28 Spec Compliance Engine'));
      console.log(pc.gray('Target: ') + pc.white(url));
      console.log(pc.gray('Protocol Detected: ') + pc.cyan(result.protocolVersion || 'Unknown / Legacy'));
      console.log();

      // Step Diagnostic Table
      console.log(pc.bold('Execution Verification Steps:'));
      for (const step of result.steps) {
        const icon = step.passed ? pc.green('✓') : pc.red('✗');
        console.log(`  ${icon} ${pc.bold(STEP_TITLES[step.step] || step.step)} ${pc.gray(`(${step.latencyMs}ms)`)}`);
        if (step.message) console.log(`    ${pc.gray(step.message)}`);
      }
      console.log();

      // Tool Insights & Risk Flags
      console.log(pc.bold(`Tool Inventory (${result.toolCount} tools declared):`));
      if (result.tools.length === 0) {
        console.log(`  ${pc.yellow('⚠ No tools declared in tools/list')}`);
      } else {
        for (const t of result.tools.slice(0, 10)) {
          const tags: string[] = [];
          if (t.readOnly) tags.push(pc.green('read-only'));
          if (t.destructive) tags.push(pc.red('destructive'));
          const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
          console.log(`  • ${pc.cyan(t.name)}${tagStr} ${pc.gray(`(${t.declaredRequiredCount} required args)`)}`);
        }
        if (result.tools.length > 10) console.log(pc.gray(`  ... and ${result.tools.length - 10} more tools`));

        const risky = destructiveWithoutHint(result);
        if (risky.length > 0) {
          console.log();
          console.log(pc.yellow(`  ⚠ Risk: ${risky.length} destructive tool(s) lack destructiveHint annotations:`));
          for (const dt of risky) console.log(pc.yellow(`    - ${dt.name}`));
        }
      }
      console.log();

      // Reliability Score HUD
      const color = result.reliabilityScore >= 80 ? pc.green : result.reliabilityScore >= 50 ? pc.yellow : pc.red;
      console.log(pc.bold('MCP Reliability Score:'));
      console.log(`  ${color(pc.bold(String(result.reliabilityScore)))} / 100  ${pc.gray(`(${reliabilityLabel(result.reliabilityScore)})`)}`);
      console.log();

      // CI Gate Enforcement
      if (belowThreshold(result.reliabilityScore)) {
        console.log(pc.red(`\n✖ CI Gate Failed: MCP reliability score ${result.reliabilityScore} is below threshold of ${opts.failUnder}\n`));
        process.exit(3);
      }
    } catch (err: any) {
      spinner.stop();
      console.error(pc.red(`\n✖ MCP Lint Error: ${err?.message || String(err)}\n`));
      process.exit(1);
    }
  });

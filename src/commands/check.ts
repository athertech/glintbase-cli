/**
 * CLI Command: glintbase check <url> [checkIds]
 * Targeted re-verification of registry check IDs (fast feedback loop).
 * Runs the ARS 3.2 probe suite (@glintbase/scanner-core) and reads each requested
 * check by exact registry id: "auth" never silently means "auth-md-structure".
 *
 * Exit codes: 0 all verified checks passed · 1 a verified check warned/failed ·
 * 2 invalid URL, unknown check id or probe error.
 */

import { Command } from 'commander';
import pc from 'picocolors';
import {
  runArs3Probes,
  validateScanUrl,
  parseCheckIds,
  partitionCheckIds,
  recheckFromResults,
  unknownCheckResult,
  type RecheckResult,
} from '@glintbase/scanner-core';
import { resolveAuditTarget } from '../core/urlPolicy.js';

function printResult(r: RecheckResult): void {
  const icon =
    r.status === 'pass' ? pc.green('✓')
    : r.status === 'warn' ? pc.yellow('!')
    : r.status === 'fail' ? pc.red('✕')
    : r.status === 'unknown' ? pc.red('?')
    : pc.dim('–');
  const label = r.status === 'unknown' ? pc.red('unknown check id') : pc.dim(`${r.status} · ${r.earnedPoints}/${r.maxPoints} pts`);
  console.log(`  ${icon}  ${pc.bold(r.checkId)}  ${label}`);
  if (r.message) console.log(`     ${pc.dim(r.message)}`);
}

export const checkCommand = new Command('check')
  .description('Fast re-verification of specific check IDs against a URL')
  .argument('<url>', 'Target URL to inspect')
  .argument('[checkIds]', 'Comma-separated registry check IDs (e.g. llms-txt-exists,robots-ai-policy-quality,anti-spa-404) or "all"', 'all')
  .action(async (rawUrl: string, checkIds: string) => {
    const targetInfo = resolveAuditTarget(rawUrl);
    const policy = validateScanUrl(targetInfo.normalizedUrl || rawUrl, { allowHttp: true });
    if (!targetInfo.isUrl || !policy.ok || !policy.url) {
      const reason = !targetInfo.isUrl ? 'not a URL' : policy.message || 'URL rejected by the scan URL policy';
      console.error(pc.red(`\n  Invalid URL "${rawUrl}": ${reason}${policy.code && policy.code !== 'OK' ? ` (${policy.code})` : ''}\n`));
      process.exit(2);
    }
    const url = policy.url;

    const requested = parseCheckIds(checkIds);
    const checkAll = requested.length === 0 || requested.some((id) => id.toLowerCase() === 'all');
    const { known, unknown } = partitionCheckIds(checkAll ? [] : requested);

    console.log('');
    console.log(pc.cyan(`╭─  ${pc.bold('GLINTBASE TARGETED CHECK')}  ────────────────────────────────────────────╮`));
    console.log(pc.cyan('│') + `  ${pc.dim('Target  :')} ${pc.bold(pc.white(url))}`.padEnd(76, ' ') + pc.cyan('│'));
    console.log(pc.cyan('│') + `  ${pc.dim('Checks  :')} ${pc.yellow(checkAll ? 'all' : requested.join(','))}`.padEnd(76, ' ') + pc.cyan('│'));
    console.log(pc.cyan(`╰─────────────────────────────────────────────────────────────────────────────╯\n`));

    // Nothing valid to verify: don't probe the site at all.
    if (!checkAll && known.length === 0) {
      for (const id of unknown) printResult(unknownCheckResult(id));
      console.log('');
      process.exit(2);
    }

    const startTime = Date.now();
    try {
      const scorecard = await runArs3Probes(url);
      const durationMs = Date.now() - startTime;

      const results = checkAll
        ? recheckFromResults(scorecard.results, scorecard.results.map((r) => r.checkId))
        : recheckFromResults(scorecard.results, requested);
      for (const r of results) printResult(r);

      const verified = results.filter((r) => r.status === 'pass' || r.status === 'warn' || r.status === 'fail');
      const passed = verified.filter((r) => r.passed).length;
      const unknownCount = results.filter((r) => r.status === 'unknown').length;
      console.log(`\n  ${pc.dim(`Checked ${results.length} items in ${durationMs}ms: ${passed}/${verified.length} verified checks passed${unknownCount ? `, ${unknownCount} unknown id(s)` : ''}.`)}\n`);

      if (unknownCount > 0) process.exit(2);
      if (passed < verified.length) process.exit(1);
      process.exit(0);
    } catch (err: any) {
      console.error(pc.red(`\n  Check failed: ${err.message}\n`));
      process.exit(2);
    }
  });

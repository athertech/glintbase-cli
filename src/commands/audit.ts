/**
 * CLI Command: glintbase audit [target] [options]
 * ARS 3.3 Agent Readiness audit, scored by @glintbase/scanner-core (the scan.glintbase.dev engine).
 * Claude Code / OpenCode HUD aesthetics, dynamic denominators, kind-aware MCP, and simulation.
 */

import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join, resolve } from 'path';
import pc from 'picocolors';
import { runArs3Probes, validateScanUrl, getCheckById } from '@glintbase/scanner-core';
import { runCodebaseArs3Audit } from '../core/codebaseAudit.js';
import { resolveConfig, getEffectiveModelInfo } from '../config.js';
import { resolveAuditTarget } from '../core/urlPolicy.js';
import { evaluateArtifactSemantics } from '../core/aiEvaluator.js';
import { fetchResource } from '@glintbase/scanner-core';
import { ARS_LABEL, CHECK_COUNT, CLI_VERSION } from '../version.js';
import { brand } from '../output/banner.js';
import { generateComprehensiveMarkdownReport } from '../output/markdownReport.js';
import { ArsSandbox } from '../core/sandbox.js';
import { runSimulation } from '../simulator/index.js';
import { printSimulatorHud } from './simulate.js';
import {
  printHeader,
  printStepTreeHeader,
  printCheckItem,
  printStepTreeFooter,
  printScorecardHud,
  printRemediationDiffCard,
  printAiEvaluationSummary,
  printEvidenceSummary,
} from '../output/terminal.js';
import type { Ars3Scorecard, CheckResult } from '@glintbase/scanner-core';

export const auditCommand = new Command('audit')
  .description(`Run full ${ARS_LABEL} agent readiness audit against codebase or live domain`)
  .argument('[target]', 'Target to audit: directory path (defaults to .) or live URL (http:// or https://)', '.')
  .option('--spec <standard>', `Audit standard: ars (full ${CHECK_COUNT} checks) | strict | core`, 'ars')
  .option('--kind <kind>', 'Force site kind: product | docs | ecommerce | auto', 'auto')
  .option('--simulate', 'Run empirical agent simulation in-memory', false)
  .option('--mode <mode>', 'Simulation mode: deterministic | live', 'deterministic')
  .option('-v, --verbose', `Display all ${CHECK_COUNT} check results line-by-line`, false)
  .option('--profile <profile>', 'Audit depth: quick | deep', 'deep')
  .option('--offline', 'Force offline deterministic AST & probe execution (no LLM calls)', false)
  .option('--ai', 'Enable AI semantic evaluation using configured model provider')
  .option('--fail-under <n>', 'Exit code 3 if ARS score is below threshold', parseInt)
  .option('--ci', 'CI mode: outputs GitHub Actions markdown summary & parameters', false)
  .option('--json', `Output raw JSON scorecard including all ${CHECK_COUNT} checks`, false)
  .option('--format <format>', 'Output format: text | json | markdown', 'text')
  .option('--report [file]', 'Save comprehensive Markdown audit report to file (defaults to agent-readiness-report.md)')
  .option('-q, --quiet', 'Minimal output (only output score)', false)
  .action(async (target: string = '.', opts: any) => {
    const targetInfo = resolveAuditTarget(target);
    const isUrl = targetInfo.isUrl;
    const effectiveTarget = targetInfo.normalizedUrl || targetInfo.target;
    const spec = (opts.spec || 'ars') as 'ars' | 'strict' | 'core';
    const kind = (opts.kind || 'auto') as 'product' | 'docs' | 'ecommerce' | 'auto';
    const config = resolveConfig(opts);
    const modelInfo = getEffectiveModelInfo(opts);
    const { resolveModelProvider } = await import('../harness/providers/resolver.js');
    const providerRes = resolveModelProvider(config);
    const isAiActive = !opts.offline && (opts.ai === true || (opts.ai !== false && modelInfo.isConfigured));
    const activeProvider = isAiActive ? providerRes.provider : null;
    const startTime = Date.now();

    let scorecard: Ars3Scorecard;
    let simResult: any;

    if (!isUrl) {
      // 1. Codebase White-Box AST Mode
      const codebaseDir = (!target || target === '.' || target.toLowerCase() === 'codebase')
        ? process.cwd()
        : targetInfo.target;

      scorecard = await runCodebaseArs3Audit(codebaseDir, {
        spec,
        kind,
        simulate: opts.simulate,
        activeProvider,
        isAiActive,
        modelDisplayName: modelInfo.displayName,
      });

      if (opts.simulate) {
        simResult = await runSimulation({ target: codebaseDir, agent: 'claude-code', mode: opts.mode || 'deterministic' });
        const isLiveMode = opts.mode === 'live';
        const simSummary = isLiveMode
          ? `Flight Simulator: ${simResult.telemetry.outcome.toUpperCase()} (${simResult.telemetry.totalTokensBurned} tokens burned, TTFTC ${simResult.telemetry.ttftcMs || simResult.telemetry.totalDurationMs}ms)`
          : `Flight Simulator [Deterministic estimate]: ${simResult.telemetry.outcome.toUpperCase()} (${simResult.telemetry.totalTokensBurned} tokens heuristic)`;
        scorecard.simulation = {
          passed: simResult.telemetry.outcome === 'completed',
          durationMs: simResult.telemetry.totalDurationMs,
          summary: simSummary,
          metrics: {
            ragNavigationSteps: simResult.telemetry.steps.length,
            authStagesResolved: simResult.telemetry.steps.find((s: any) => s.phase === 'auth')?.status === 'pass' ? 6 : 1,
            toolsVerified: simResult.targetContext?.mcpTools?.length || 0,
            tokenUsageEstimate: simResult.telemetry.totalTokensBurned,
          },
          details: simResult.telemetry.steps.map((s: any) => `[${s.phase.toUpperCase()}] ${s.action} - ${s.status.toUpperCase()}: ${s.details}`)
        };
      }
    } else {
      // 2. Live Remote URL Mode
      // The engine's URL policy (shared with scan.glintbase.dev) refuses loopback, private
      // and metadata hosts and non-standard ports. Say so up front instead of reporting
      // every probe as unreachable.
      const policy = validateScanUrl(effectiveTarget, { allowHttp: true });
      if (!policy.ok) {
        const reason = policy.message || 'URL rejected by the scan URL policy';
        const hint = policy.code === 'SSRF_BLOCKED' || policy.code === 'PORT_NOT_ALLOWED'
          ? 'Live probes only run against public hosts on standard ports. To audit a local project, run `glintbase audit <project-dir>` (codebase audit), or expose the dev server on a public URL.'
          : undefined;
        if (opts.json || opts.format === 'json') {
          console.log(JSON.stringify({ error: reason, code: policy.code, target: effectiveTarget, hint }, null, 2));
        } else if (opts.quiet) {
          console.log(0);
        } else {
          console.error(pc.red(`\n  ✖ Cannot audit ${effectiveTarget}: ${reason} (${policy.code})`));
          if (hint) console.error(pc.dim(`    ${hint}`));
          console.error('');
        }
        process.exit(2);
      }

      // Preflight reachability check: cleanly abort on DNS failure, connection refused, or connect timeout
      const preflight = await fetchResource(effectiveTarget, {
        method: 'GET',
        timeoutMs: 8000,
        allowErrorBody: true,
      });

      const isUnreachable = Boolean(
        preflight.networkError || (
          !preflight.httpStatus && (preflight.status === 'timeout' || preflight.status === 'failed' || preflight.status === 'unreachable' || preflight.status === 'blocked')
        )
      );

      if (isUnreachable) {
        const errorMsg = preflight.error || `Failed to connect to ${effectiveTarget}`;
        if (opts.json || opts.format === 'json') {
          console.log(JSON.stringify({
            error: errorMsg,
            target: effectiveTarget,
            unreachable: true,
            status: preflight.status || 'failed',
          }, null, 2));
        } else if (opts.quiet) {
          console.log(0);
        } else {
          console.error(pc.red(`\n  ✖ Target unreachable: ${errorMsg}\n`));
        }
        process.exit(2);
      }

      scorecard = await runArs3Probes(effectiveTarget, {
        spec,
        kind,
      });

      if (opts.simulate) {
        simResult = await runSimulation({ target: effectiveTarget, agent: 'claude-code', mode: opts.mode || 'deterministic' });
        const isLiveMode = opts.mode === 'live';
        const simSummary = isLiveMode
          ? `Flight Simulator: ${simResult.telemetry.outcome.toUpperCase()} (${simResult.telemetry.totalTokensBurned} tokens burned, TTFTC ${simResult.telemetry.ttftcMs || simResult.telemetry.totalDurationMs}ms)`
          : `Flight Simulator [Deterministic estimate]: ${simResult.telemetry.outcome.toUpperCase()} (${simResult.telemetry.totalTokensBurned} tokens heuristic)`;
        scorecard.simulation = {
          passed: simResult.telemetry.outcome === 'completed',
          durationMs: simResult.telemetry.totalDurationMs,
          summary: simSummary,
          metrics: {
            ragNavigationSteps: simResult.telemetry.steps.length,
            authStagesResolved: simResult.telemetry.steps.find((s: any) => s.phase === 'auth')?.status === 'pass' ? 6 : 1,
            toolsVerified: simResult.targetContext?.mcpTools?.length || 0,
            tokenUsageEstimate: simResult.telemetry.totalTokensBurned,
          },
          details: simResult.telemetry.steps.map((s: any) => `[${s.phase.toUpperCase()}] ${s.action} - ${s.status.toUpperCase()}: ${s.details}`)
        };
      }

      // Semantic Evaluations (AI or offline heuristic)
      const aiEvaluations: Record<string, any> = {};
      try {
        const u = new URL(effectiveTarget);
        const llmsRes = await fetchResource(`${u.origin}/llms.txt`, { timeoutMs: 5000 });
        if (llmsRes.ok && llmsRes.body && !llmsRes.body.includes('<html')) {
          aiEvaluations['llms.txt'] = await evaluateArtifactSemantics('llms.txt', llmsRes.body, activeProvider);
        }
        const authRes = await fetchResource(`${u.origin}/auth.md`, { timeoutMs: 5000 });
        if (authRes.ok && authRes.body && !authRes.body.includes('<html')) {
          aiEvaluations['auth.md'] = await evaluateArtifactSemantics('auth.md', authRes.body, activeProvider);
        }
      } catch {
        // ignore network or parse failures during optional semantic evaluation
      }
      scorecard.aiEvaluations = aiEvaluations;
      scorecard.intelligence = isAiActive
        ? `${modelInfo.displayName} (Active)`
        : 'Deterministic AST & Probes Engine (Offline)';
    }

    const durationMs = Date.now() - startTime;
    scorecard.durationMs = durationMs;

    // Output Mode: Quiet
    if (opts.quiet) {
      console.log(scorecard.score);
      return;
    }

    // Output Mode: JSON
    if (opts.json || opts.format === 'json') {
      // score_version mirrors the field name scan.glintbase.dev uses for the same value.
      console.log(JSON.stringify({ score_version: scorecard.version, cli_version: CLI_VERSION, ...scorecard }, null, 2));
      return;
    }

    // Output Mode: Markdown
    if (opts.format === 'markdown') {
      const markdownReport = generateComprehensiveMarkdownReport(scorecard, effectiveTarget, opts);
      console.log(markdownReport);

      if (opts.report) {
        const reportPath = typeof opts.report === 'string' ? opts.report : 'agent-readiness-report.md';
        writeFileSync(resolve(process.cwd(), reportPath), markdownReport, 'utf-8');
      }

      if (opts.ci || process.env.GITHUB_STEP_SUMMARY) {
        if (process.env.GITHUB_STEP_SUMMARY) {
          writeFileSync(process.env.GITHUB_STEP_SUMMARY, markdownReport, { encoding: 'utf8', flag: 'a' });
        }
        if (process.env.GITHUB_OUTPUT) {
          try {
            appendFileSync(process.env.GITHUB_OUTPUT, `ars_score=${scorecard.score}\nars_grade=${scorecard.grade}\nstatus=${scorecard.score >= 70 ? 'pass' : 'fail'}\n`, 'utf-8');
          } catch { /* ignore */ }
        }
      }

      const threshold = opts.failUnder ?? config.failUnder;
      if (threshold !== null && threshold !== undefined && scorecard.score < threshold) {
        console.error(pc.red(`\n  Gate Failure: Score ${scorecard.score} is below --fail-under threshold (${threshold})\n`));
        process.exit(3);
      }
      return;
    }

    // Output Mode: Terminal Text (HUD)
    const modelDisplay = isAiActive
      ? `${pc.green(modelInfo.displayName)} ${pc.cyan('· Active')}`
      : `${pc.dim('Deterministic AST & Probes Engine')} ${pc.dim('· Offline')}`;

    printHeader(
      effectiveTarget,
      config,
      scorecard.archetype.label,
      scorecard.activeDenominator,
      `${ARS_LABEL} ${spec.toUpperCase()} (${scorecard.results.length} of ${CHECK_COUNT} Checks)`,
      modelDisplay
    );

    printStepTreeHeader();

    // Determine checks to display in HUD
    const checksToPrint: CheckResult[] = opts.verbose
      ? scorecard.results
      : scorecard.results.filter(c => {
        // In default mode: print all warnings/fails, all earned bonuses, and key required checks
        if (c.status === 'fail' || c.status === 'warn') return true;
        if (c.isBonus && c.status === 'pass') return true;
        const keyIds = [
          'robots-ai-policy-quality',
          'ard-catalog',
          'content-no-js',
          'markdown-negotiation',
          'anti-spa-404',
          'code-fence-validity',
          'mcp-server-manifest',
          'mcp-transport-streamable',
          'auth-bearer-token-support',
        ];
        return keyIds.includes(c.checkId);
      });

    for (const c of checksToPrint) {
      // The registry owns each check's layer; id prefixes are not reliable.
      const layer = c.layer ?? getCheckById(c.checkId)?.layer;
      const layerShort = layer === 'discovery' ? 'L1' : layer === 'access' ? 'L2' : layer === 'usability' ? 'L3' : 'L4';

      const ptsText = c.status === 'pass'
        ? `+${c.earnedPoints} pt${c.earnedPoints === 1 ? '' : 's'}`
        : c.status === 'skip' || c.status === 'na'
        ? 'N/A'
        : '0 pts';

      printCheckItem(c.status, layerShort, c.message || c.checkId, ptsText, c.isBonus && c.status === 'pass');
    }

    if (!opts.verbose && scorecard.results.length > checksToPrint.length) {
      console.log(pc.dim(`\n  ... and ${scorecard.results.length - checksToPrint.length} additional protocol checks passed. Pass --verbose to display all.`));
    }

    printStepTreeFooter(durationMs);

    // Render AI Semantic Evaluations if available
    if (scorecard.aiEvaluations && Object.keys(scorecard.aiEvaluations).length > 0) {
      printAiEvaluationSummary(scorecard.aiEvaluations);
    }

    // Render Simulation results if enabled
    if (simResult) {
      printSimulatorHud(simResult.telemetry, simResult.counterfactual, {
        target: effectiveTarget,
        agentName: simResult.persona.name,
        contextTokens: simResult.persona.maxContextTokens,
        mode: opts.mode || 'deterministic',
        intent: 'Audit Empirical Verification'
      });
    } else if (scorecard.simulation) {
      console.log(`  ${brand.orange('◇')}  ${pc.bold('Empirical Agent Simulation Engine')}`);
      for (const line of scorecard.simulation.details) {
        console.log(`  ${pc.dim('│')}  ${line}`);
      }
      console.log(`  ${pc.dim('└')}  ${pc.cyan(scorecard.simulation.summary)}\n`);
    }

    // Render HUD Scorecard
    const hudLayers = [
      {
        name: 'Layer 1: Discovery',
        score: scorecard.layers.discovery.baseEarned,
        maxScore: scorecard.layers.discovery.baseMax,
        statusText: scorecard.layers.discovery.statusText,
      },
      {
        name: 'Layer 2: Access & Understanding',
        score: scorecard.layers.access.baseEarned,
        maxScore: scorecard.layers.access.baseMax,
        statusText: scorecard.layers.access.statusText,
      },
      {
        name: 'Layer 3: Usability & Interoperability',
        score: scorecard.layers.usability.baseEarned,
        maxScore: scorecard.layers.usability.baseMax,
        statusText: scorecard.layers.usability.statusText,
        applicable: scorecard.layers.usability.applicable,
      },
      {
        name: 'Layer 4: Payments & Commerce',
        score: scorecard.layers.payments.baseEarned,
        maxScore: scorecard.layers.payments.baseMax,
        statusText: scorecard.layers.payments.statusText,
        applicable: scorecard.layers.payments.applicable,
      },
    ];

    printScorecardHud(scorecard.score, scorecard.version, hudLayers, scorecard.grade, scorecard.gradeLabel);
    printEvidenceSummary(scorecard.evidence);

    // Actionable Remediations
    if (scorecard.remediations.length > 0) {
      console.log(pc.bold(`  Actionable Remediations (${scorecard.remediations.length} Detected):\n`));
      for (const rem of scorecard.remediations.slice(0, 4)) {
        printRemediationDiffCard(rem.title, rem.targetFile, rem.description, ['+ // Living Agent Specification generated by Glintbase'], rem.fixCommand);
      }
      console.log(`  Run ${brand.orangeBold('glintbase fix')} to apply verified remediations automatically.\n`);
    } else {
      console.log(pc.green(`  ✦ Codebase is fully compliant with ${ARS_LABEL} Living Agent standards!\n`));
    }

    // Comprehensive Markdown Report Generation (File Export)
    if (opts.report) {
      const reportPath = typeof opts.report === 'string' ? opts.report : 'agent-readiness-report.md';
      const mdReport = generateComprehensiveMarkdownReport(scorecard, effectiveTarget, opts);
      writeFileSync(resolve(process.cwd(), reportPath), mdReport, 'utf-8');
      console.log(pc.green(`  ✦ Comprehensive Markdown audit report saved to ${pc.bold(reportPath)}\n`));
    }

    // CI Gates & Step Summary
    if (opts.ci || process.env.GITHUB_STEP_SUMMARY) {
      if (process.env.GITHUB_STEP_SUMMARY) {
        const mdReport = generateComprehensiveMarkdownReport(scorecard, effectiveTarget, opts);
        writeFileSync(process.env.GITHUB_STEP_SUMMARY, mdReport, { encoding: 'utf8', flag: 'a' });
      }
      if (process.env.GITHUB_OUTPUT) {
        try {
          appendFileSync(process.env.GITHUB_OUTPUT, `ars_score=${scorecard.score}\nars_grade=${scorecard.grade}\nstatus=${scorecard.score >= 70 ? 'pass' : 'fail'}\n`, 'utf-8');
        } catch { /* ignore */ }
      }
    }

    const threshold = opts.failUnder ?? config.failUnder;
    if (threshold !== null && threshold !== undefined && scorecard.score < threshold) {
      console.error(pc.red(`\n  Gate Failure: Score ${scorecard.score} is below --fail-under threshold (${threshold})\n`));
      process.exit(3);
    }
  });

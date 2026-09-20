/**
 * CLI Command: glintbase simulate
 * Autonomous Agent Flight Simulator HUD & Trajectory Runner.
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { runSimulation } from '../simulator/index.js';
import type { SimulationOptions, SimulationTelemetry, CounterfactualComparison } from '../simulator/types.js';

export const simulateCommand = new Command('simulate')
  .description('Autonomous Agent Flight Simulator: empirically executes agent personas against target APIs')
  .argument('[target]', 'Target API endpoint URL or local workspace directory', '.')
  .option('-a, --agent <profile>', 'Agent persona profile: claude-code | cursor | perplexity', 'claude-code')
  .option('-m, --mode <mode>', 'Simulation mode: deterministic | live', 'deterministic')
  .option('-i, --intent <prompt>', 'Custom natural language goal or mission intent')
  .option('--allow-mutations', 'Permit live destructive/mutating API calls instead of synthetic dry-run', false)
  .option('--json', 'Output machine-readable JSON telemetry', false)
  .option('--ci', 'CI mode: exit with status 1 if trajectory is blocked or hallucinated', false)
  .action(async (target: string = '.', opts: any) => {
    try {
      const options: SimulationOptions = {
        target,
        agent: opts.agent,
        mode: opts.mode,
        intent: opts.intent,
        allowMutations: opts.allowMutations,
        json: opts.json,
        ci: opts.ci
      };

      const result = await runSimulation(options);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        if (opts.ci && result.telemetry.outcome !== 'completed') {
          process.exit(1);
        }
        return;
      }

      // Render HUD
      printSimulatorHud(result.telemetry, result.counterfactual, {
        target,
        agentName: result.persona.name,
        contextTokens: result.persona.maxContextTokens,
        mode: opts.mode || 'deterministic',
        intent: opts.intent || 'Default Golden Suite'
      });

      if (opts.ci && result.telemetry.outcome !== 'completed') {
        process.exit(1);
      }
    } catch (err: any) {
      console.error(pc.red(`\nSimulation error: ${err.message}`));
      process.exit(1);
    }
  });

export function printSimulatorHud(
  telemetry: SimulationTelemetry,
  counterfactual: CounterfactualComparison | undefined,
  meta: { target: string; agentName: string; contextTokens: number; mode: string; intent: string }
): void {
  console.log(pc.cyan('\n┌  ') + pc.bold(pc.white('Glintbase Agent Flight Simulator')));
  console.log(pc.cyan('│  ') + pc.dim('Target: ') + pc.cyan(meta.target) + pc.dim('  |  Persona: ') + pc.yellow(`${meta.agentName} (${meta.contextTokens.toLocaleString()} tokens)`));
  console.log(pc.cyan('│  ') + pc.dim('Mode: ') + pc.white(meta.mode === 'live' ? 'Live LLM Provider' : 'Deterministic estimate') + pc.dim('   |  Intent: ') + pc.dim(meta.intent));
  console.log(pc.cyan('│'));

  // Trajectory Breadcrumbs
  console.log(pc.cyan('◇  ') + pc.bold('Trajectory Breadcrumbs:'));
  for (const step of telemetry.steps) {
    let badge = pc.green('PASS');
    if (step.status === 'warn') badge = pc.yellow('WARN');
    if (step.status === 'fail') badge = pc.red('FAIL');
    if (step.status === 'skip') badge = pc.dim('SKIP');

    const phaseLabel = pc.dim(`[${step.phase.toUpperCase().padEnd(9)}]`);
    const actionLabel = step.action.padEnd(36);
    const metrics = pc.dim(`(${step.durationMs}ms, ${step.tokensConsumed} tokens)`);

    console.log(pc.cyan('│  ') + `${step.stepIndex}. ${phaseLabel} ${actionLabel} ${badge}  ${metrics}`);
    if (step.details) {
      console.log(pc.cyan('│     ') + pc.dim(step.details));
    }
  }
  console.log(pc.cyan('│'));

  // Telemetry & Economics
  console.log(pc.cyan('◇  ') + pc.bold('Telemetry & Economics:'));
  const outcomeColor = telemetry.outcome === 'completed'
    ? pc.green(pc.bold('COMPLETED'))
    : telemetry.outcome === 'blocked'
      ? pc.red(pc.bold('BLOCKED'))
      : telemetry.outcome === 'failed'
        ? pc.red(pc.bold('FAILED'))
        : telemetry.outcome === 'partial'
          ? pc.yellow(pc.bold('PARTIAL'))
          : pc.yellow(pc.bold(telemetry.outcome.toUpperCase()));

  console.log(pc.cyan('│  ') + 'Outcome:               ' + outcomeColor);
  if (meta.mode === 'live') {
    console.log(pc.cyan('│  ') + 'Time-To-First-Tool:    ' + pc.white(`${telemetry.ttftcMs || telemetry.totalDurationMs}ms`));
    console.log(pc.cyan('│  ') + 'Total Tokens Burned:   ' + pc.white(`${telemetry.totalTokensBurned.toLocaleString()} tokens`));
    console.log(pc.cyan('│  ') + 'Estimated Tax:         ' + pc.white(`$${telemetry.dollarTaxUsd.toFixed(5)} / agent session`));
  } else {
    console.log(pc.cyan('│  ') + 'Time-To-First-Tool:    ' + pc.dim('N/A (Requires --mode live)'));
    console.log(pc.cyan('│  ') + 'Total Tokens Burned:   ' + pc.white(`${telemetry.totalTokensBurned.toLocaleString()} tokens (heuristic)`));
    console.log(pc.cyan('│  ') + 'Estimated Tax:         ' + pc.dim('N/A (Requires --mode live)'));
  }

  let frictionLabel = pc.green(`${telemetry.schemaFrictionScore}/100 (Flawless)`);
  if (telemetry.schemaFrictionScore > 30 && telemetry.schemaFrictionScore <= 60) {
    frictionLabel = pc.yellow(`${telemetry.schemaFrictionScore}/100 (Moderate Friction)`);
  } else if (telemetry.schemaFrictionScore > 60) {
    frictionLabel = pc.red(`${telemetry.schemaFrictionScore}/100 (Hostile)`);
  }
  console.log(pc.cyan('│  ') + 'Schema Friction Index: ' + frictionLabel);

  if (telemetry.failureBottleneck) {
    console.log(pc.cyan('│  ') + pc.red('Bottleneck:            ' + telemetry.failureBottleneck));
  }
  console.log(pc.cyan('│'));

  // Diagnostic Failure Analysis
  if (telemetry.failureDetails) {
    const fd = telemetry.failureDetails;
    console.log(pc.cyan('◇  ') + pc.bold(pc.red('Diagnostic Failure Analysis:')));
    console.log(pc.cyan('│  ') + pc.bold('Failure Mode:          ') + pc.red(pc.bold(`[${fd.code}]`)));
    console.log(pc.cyan('│  ') + pc.bold('Lifecycle Phase:       ') + pc.yellow(fd.phase.toUpperCase()));
    console.log(pc.cyan('│  ') + pc.bold('Root Cause:            ') + pc.white(fd.message));
    console.log(pc.cyan('│  ') + pc.bold('Expected Pattern:      ') + pc.dim(fd.expected));
    if (fd.closestMatches && fd.closestMatches.length > 0) {
      console.log(pc.cyan('│  ') + pc.bold('Suggested Candidates:  ') + pc.green(fd.closestMatches.join(', ')));
    }
    console.log(pc.cyan('│  ') + pc.bold('Remediation:           ') + pc.cyan(fd.remediation));
    console.log(pc.cyan('│'));
  }

  // Counterfactual Sandbox
  if (counterfactual) {
    console.log(pc.cyan('◇  ') + pc.bold('Counterfactual Sandbox (What-If Remediation):'));
    console.log(pc.cyan('│  ') + 'Status:                ' + pc.dim(`${telemetry.outcome.toUpperCase()} ➔ `) + pc.green(pc.bold(counterfactual.after.outcome.toUpperCase())));
    if (counterfactual.tokensSavedPercent > 0) {
      console.log(pc.cyan('│  ') + 'Tokens Saved:          ' + pc.green(`-${counterfactual.tokensSavedPercent}% reduction in exploratory tokens`));
    }
    if (counterfactual.latencySavedPercent > 0) {
      console.log(pc.cyan('│  ') + 'Latency Saved:         ' + pc.green(`-${counterfactual.latencySavedPercent}% faster time-to-first-tool`));
    }
    if (counterfactual.fixedBottlenecks.length > 0) {
      console.log(pc.cyan('│  ') + 'Bottlenecks Fixed:     ' + pc.dim(counterfactual.fixedBottlenecks.join(', ')));
    }
    console.log(pc.cyan('│  ') + 'Fix Available:         ' + pc.cyan('glintbase fix --agent'));
    console.log(pc.cyan('│'));
  }

  // Footer
  if (telemetry.outcome === 'completed') {
    console.log(pc.cyan('└  ') + pc.green('Trajectory passed cleanly without friction. Ready for autonomous agents.\n'));
  } else {
    console.log(pc.cyan('└  ') + pc.yellow(`Trajectory ${telemetry.outcome}. Run `) + pc.cyan('glintbase fix') + pc.yellow(' to mount counterfactual fixes.\n'));
  }
}

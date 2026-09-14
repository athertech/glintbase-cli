/**
 * Modern Terminal UI for Glintbase CLI (ARS 3.0 & ARS 2.0)
 * Styled in signature Glintbase Solar Neon Orange with hairline typography,
 * HUD scorecards, step trees, and remediation diff cards.
 */

import pc from 'picocolors';
import type { ResolvedConfig } from '../config.js';
import { scoreBandLabel, getArsGrade } from '../core/scoreBand.js';
import type { ArsGrade } from '../core/checks/types.js';
import { brand } from './banner.js';

export function renderProgressBar(score: number, maxScore = 100, length = 24): string {
  const pct = maxScore > 0 ? Math.min(1, Math.max(0, score / maxScore)) : 0;
  const filledCount = Math.round(pct * length);
  const emptyCount = length - filledCount;

  const color = scoreColor(Math.round(pct * 100));
  const bar = color('█'.repeat(filledCount)) + pc.dim('░'.repeat(emptyCount));
  const percentText = `${Math.round(pct * 100)}%`.padStart(4, ' ');

  return `${bar} ${pc.bold(color(percentText))}`;
}

export function scoreColor(score: number): (s: string) => string {
  if (score >= 90) return pc.green;
  if (score >= 75) return pc.cyan;
  if (score >= 50) return pc.yellow;
  return pc.red;
}

export function printHeader(
  url: string,
  config?: ResolvedConfig,
  archetype = 'Developer Platform / API',
  denominator = 85,
  spec = 'ARS 3.0 Comprehensive (119 Open Checks)',
  modelDisplay?: string
): void {
  const width = 74;
  console.log('');
  console.log(`  ${pc.dim('┌')}  ${brand.orangeBold('GLINTBASE AUDIT 3.0')} ${pc.dim('·')} ${pc.white('Living Agent Readiness')}`);
  console.log(`  ${pc.dim('│')}  ${pc.dim('Target     :')} ${pc.bold(pc.white(url))}`);
  console.log(`  ${pc.dim('│')}  ${pc.dim('Standard   :')} ${pc.cyan(spec)}`);
  console.log(`  ${pc.dim('│')}  ${pc.dim('Archetype  :')} ${pc.green(archetype)}`);
  console.log(`  ${pc.dim('│')}  ${pc.dim('Denominator:')} ${brand.glow(`${denominator} pts`)} ${pc.dim('(Dynamic scaling active)')}`);
  if (modelDisplay) {
    console.log(`  ${pc.dim('│')}  ${pc.dim('Intelligence:')} ${modelDisplay}`);
  }
  console.log(`  ${pc.dim('└' + '─'.repeat(width))}\n`);
}

export function printAiEvaluationSummary(evaluations: Record<string, any>): void {
  const entries = Object.entries(evaluations).filter(([_, ev]) => ev && typeof ev === 'object');
  if (entries.length === 0) return;
  const anyAi = entries.some(([_, ev]) => ev.evaluatedWithAi);
  const title = anyAi ? 'Agentic AI Semantic Evaluations' : 'Artifact Semantic Structural Evaluations (Offline)';
  console.log(`  ${brand.orange('◇')}  ${pc.bold(title)}\n`);
  for (const [key, ev] of entries) {
    const icon = ev.passed ? pc.green('✓') : pc.yellow('▲');
    const badge = ev.evaluatedWithAi ? pc.cyan(`[AI: ${ev.modelUsed || 'active'}]`) : pc.dim('[Offline Heuristic]');
    const color = ev.score >= 80 ? pc.green : ev.score >= 50 ? pc.yellow : pc.red;
    console.log(`  ${icon}  ${pc.bold(key.padEnd(14, ' '))} ${badge} ${color(`${ev.score}/100 pts`)} · ${pc.dim(ev.summary)}`);
    if (ev.issues && ev.issues.length > 0) {
      for (const issue of ev.issues.slice(0, 3)) {
        console.log(`     ${pc.dim('•')} ${pc.yellow(issue)}`);
      }
    }
  }
  console.log('');
}

export function printStepTreeHeader(): void {
  console.log(`  ${brand.orange('◇')}  ${pc.bold('Evaluated Protocol Checks & Probes')}\n`);
}

export function printCheckItem(
  status: 'pass' | 'fail' | 'warn' | 'skip' | 'info' | 'na',
  layerId: string,
  name: string,
  pointsText: string,
  isBonus = false
): void {
  let badge = pc.green('PASS');
  if (status === 'fail') badge = pc.red('FAIL');
  else if (status === 'warn') badge = brand.orange('WARN');
  else if (status === 'skip') badge = pc.dim('SKIP');
  else if (status === 'na') badge = pc.dim('SKIP');

  const layerTag = pc.dim(`[${layerId.toUpperCase()}]`);
  const bonusTag = isBonus ? pc.magenta(' (BONUS)') : '';
  const ptsColor = status === 'pass' ? pc.green : status === 'fail' ? pc.red : pc.dim;

  const paddedName = name.slice(0, 52).padEnd(54, ' ');
  console.log(`  ${badge.padEnd(5, ' ')} ${layerTag} ${paddedName} ${ptsColor(pointsText)}${bonusTag}`);
}

export function printStepItem(
  status: 'pass' | 'fail' | 'warn' | 'skip' | 'info',
  stepNumber: number,
  label: string,
  detail?: string,
  points?: string
): void {
  let icon = pc.green('✓');
  if (status === 'fail') icon = pc.red('✕');
  if (status === 'warn') icon = brand.orange('▲');
  if (status === 'skip') icon = pc.dim('○');
  if (status === 'info') icon = pc.blue('●');

  const stepStr = `${stepNumber}.`.padEnd(3, ' ');
  const labelStr = label.padEnd(26, ' ');
  const detailStr = detail ? pc.dim(detail.slice(0, 34).padEnd(35, ' ')) : ''.padEnd(35, ' ');
  const ptsStr = points ? (status === 'pass' ? pc.green(points) : status === 'fail' ? pc.red(points) : pc.dim(points)) : '';

  console.log(`  ${pc.dim('│')}  ${icon}  ${pc.dim(stepStr)} ${pc.white(labelStr)} ${detailStr} ${ptsStr}`);
}

export function printStepTreeFooter(durationMs: number): void {
  console.log(`\n  ${pc.dim('└')}  ${pc.dim(`Completed in ${durationMs}ms`)}\n`);
}

export function printScorecardHud(
  score: number,
  version = 'ars-3.0.0',
  layers?: Array<{ name: string; score: number; maxScore: number; statusText?: string; applicable?: boolean }>,
  grade?: ArsGrade,
  gradeLabel?: string
): void {
  const band = grade || getArsGrade(score).grade;
  const label = gradeLabel || getArsGrade(score).label;
  const color = scoreColor(score);
  const width = 74;

  console.log(`  ${pc.dim('┌' + '─'.repeat(width))}`);
  console.log(`  ${pc.dim('│')}  ${pc.bold('OVERALL SCORE:')} ${color(pc.bold(`${score} / 100`))}`);
  console.log(`  ${pc.dim('│')}  ${pc.bold('GRADE        :')} ${color(pc.bold(`${band}`))} ${pc.dim(`(${label}) · Certified Autonomous Ready`)}`);
  console.log(`  ${pc.dim('│')}  ${pc.bold('HEALTH METER :')} ${renderProgressBar(score, 100, 24)}`);

  if (layers && layers.length > 0) {
    console.log(`  ${pc.dim('├' + '─'.repeat(width))}`);
    for (const l of layers) {
      if (l.applicable === false) {
        console.log(`  ${pc.dim('│')}  ${pc.dim(l.name.padEnd(32, ' '))} ${pc.dim('N/A (Excluded from denominator)')}`);
      } else {
        const pts = `[${l.score}/${l.maxScore} pts]`.padEnd(14, ' ');
        const bar = renderProgressBar(l.score, l.maxScore, 14);
        const status = l.statusText ? pc.dim(`· ${l.statusText}`) : '';
        console.log(`  ${pc.dim('│')}  ${pc.white(l.name.padEnd(32, ' '))} ${pts} ${bar} ${status}`);
      }
    }
  }

  console.log(`  ${pc.dim('└' + '─'.repeat(width))}\n`);
}

export function printRemediationDiffCard(
  title: string,
  targetFile: string,
  impact: string,
  proposedDiff: string[],
  command: string
): void {
  const width = 74;
  console.log(`  ${pc.dim('┌─')} ${brand.orangeBold('[ACTIONABLE REMEDIATION]')} ${pc.bold(title)}`);
  console.log(`  ${pc.dim('│')}  ${pc.dim('Target File :')} ${pc.white(targetFile)}`);
  console.log(`  ${pc.dim('│')}  ${pc.dim('Diagnostics :')} ${pc.yellow(impact)}`);

  if (proposedDiff.length > 0) {
    console.log(`  ${pc.dim('│')}  ${pc.dim('Diff Snippet:')}`);
    for (const line of proposedDiff.slice(0, 6)) {
      const formatted = line.startsWith('+') ? pc.green(line) : line.startsWith('-') ? pc.red(line) : pc.dim(line);
      console.log(`  ${pc.dim('│')}    ${formatted}`);
    }
  }

  console.log(`  ${pc.dim('│')}  ${brand.orange('▶')} Run ${brand.glow(command)} to apply.`);
  console.log(`  ${pc.dim('└' + '─'.repeat(width))}\n`);
}

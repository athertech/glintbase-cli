/**
 * CLI Command: glintbase ci
 * Enterprise CI/CD Quality Gate & PR Drift Gate for Autonomous AI Agents (ARS 3.0).
 * Supports dual-mode execution:
 *   - Codebase Mode: Fast AST audit (<150ms) without running servers
 *   - Live URL Mode: Deep network probe suite against running URLs
 * Inspects git diff drift, emits $GITHUB_OUTPUT and $GITHUB_STEP_SUMMARY,
 * generates committable PR suggestions, posts sticky PR comments, and supports --auto-commit.
 */

import { Command } from 'commander';
import { execSync } from 'child_process';
import { existsSync, appendFileSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import pc from 'picocolors';

import { runArs3Probes } from '../core/probes/index.js';
import { runCodebaseArs3Audit } from '../core/codebaseAudit.js';
import { resolveConfig } from '../config.js';
import { resolveAuditTarget } from '../core/urlPolicy.js';
import { printScorecardHud } from '../output/terminal.js';
import { renderCommandHeader, brand } from '../output/banner.js';
import { scanRoutes } from '../ast/routeScanner.js';
import { detectFramework } from '../ast/frameworkDetector.js';
import {
  generateAuthMd,
  generateRobotsTxt,
  generateArdJson,
  generateOpenApiSpec,
  generateNotFoundRoute,
} from '../ast/generators.js';
import { indexDocumentation, generateLlmsTxt } from '../ast/docIndexer.js';
import { inspectWorkspaceGaps } from '../session/agentBrain.js';
import type { Ars3Scorecard } from '../core/checks/types.js';

export interface CiGateResult {
  passed: boolean;
  score: number;
  failUnder: number;
  archetype: string;
  grade: string;
  driftDetected: boolean;
  driftReasons: string[];
  remediations: Array<{ file: string; content: string; rationale: string }>;
  markdownSummary: string;
}

/**
 * Emit variable to modern GitHub Actions $GITHUB_OUTPUT and legacy ::set-output.
 */
export function setGitHubOutput(key: string, value: string | number | boolean): void {
  if (process.env.GITHUB_OUTPUT) {
    try {
      appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`, 'utf-8');
    } catch {
      /* ignore */
    }
  }
}

/**
 * Inspect git repository to identify agent-readiness drift between branches.
 */
export function inspectGitDrift(
  baseBranch = 'origin/main',
  cwd = process.cwd()
): { driftDetected: boolean; reasons: string[]; modifiedFiles: string[] } {
  const reasons: string[] = [];
  const modifiedFiles: string[] = [];

  try {
    // Check if inside a git repository
    execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'ignore' });

    let diffOutput = '';
    try {
      // 1. Try comparing against remote/base branch
      diffOutput = execSync(`git diff ${baseBranch}...HEAD --name-only`, { cwd, encoding: 'utf-8' });
    } catch {
      try {
        // 2. Try comparing against local main
        diffOutput = execSync('git diff main...HEAD --name-only', { cwd, encoding: 'utf-8' });
      } catch {
        try {
          // 3. Fallback to previous commit
          diffOutput = execSync('git diff HEAD~1 --name-only', { cwd, encoding: 'utf-8' });
        } catch {
          // 4. Fallback to uncommitted local changes
          diffOutput = execSync('git diff HEAD --name-only', { cwd, encoding: 'utf-8' });
        }
      }
    }

    const files = diffOutput.split('\n').map(f => f.trim()).filter(Boolean);
    modifiedFiles.push(...files);

    const hasNewRoutes = files.some(f => /api\/|routes\/|controllers\//i.test(f));
    const touchedLlms = files.some(f => f.includes('llms.txt') || f.includes('llms-full.txt'));
    const touchedAuth = files.some(f => f.includes('auth.md'));
    const touchedArd = files.some(f => f.includes('ard.json'));
    const touchedOpenApi = files.some(f => f.includes('openapi.json') || f.includes('swagger.json'));

    if (hasNewRoutes && !touchedLlms) {
      reasons.push('New or modified API routes detected without updating `llms.txt` documentation index.');
    }

    if (hasNewRoutes && !touchedAuth) {
      reasons.push('API route surface modified without updating `auth.md` authentication catalog.');
    }

    if (hasNewRoutes && !touchedArd) {
      reasons.push('API route surface modified without refreshing `.well-known/ard.json` resource discovery.');
    }

    if (hasNewRoutes && !touchedOpenApi) {
      reasons.push('API route surface modified without synchronizing `openapi.json` specification.');
    }

    try {
      const deletedFiles = execSync('git diff --name-only --diff-filter=D HEAD', { cwd, encoding: 'utf-8' })
        .split('\n')
        .map(f => f.trim())
        .filter(Boolean);

      if (deletedFiles.some(f => f.includes('robots.txt'))) {
        reasons.push('Critical `robots.txt` AI crawler policy was deleted in this changeset.');
      }
    } catch {
      /* ignore */
    }
  } catch {
    /* not a git repo or git not available */
  }

  return {
    driftDetected: reasons.length > 0,
    reasons,
    modifiedFiles,
  };
}

/**
 * Generate GitHub Actions Step Summary & PR Comment in Markdown.
 */
export function formatGitHubStepSummary(
  optionsOrScore: any,
  failUnderArg?: number,
  passedArg?: boolean,
  targetArg?: string,
  reasonsArg?: string[],
  remediationsArg?: Array<{ file: string; content: string; rationale: string }>
): string {
  const opts = typeof optionsOrScore === 'object'
    ? optionsOrScore
    : {
        score: optionsOrScore,
        failUnder: failUnderArg ?? 75,
        passed: passedArg ?? true,
        target: targetArg ?? '.',
        archetype: 'Developer Platform & API',
        grade: 'B',
        reasons: reasonsArg ?? [],
        remediations: remediationsArg ?? [],
      };

  const {
    score,
    failUnder,
    passed,
    target,
    archetype = 'Developer Platform & API',
    grade = 'B',
    layers,
    reasons = [],
    remediations = [],
    delta,
  } = opts;

  const statusBadge = passed
    ? '![Agent Readiness Gate Passed](https://img.shields.io/badge/Agent_Readiness_Gate-PASSED-22c55e?style=for-the-badge)'
    : '![Agent Readiness Gate Failed](https://img.shields.io/badge/Agent_Readiness_Gate-FAILED-ef4444?style=for-the-badge)';

  const scoreDisplay = delta
    ? `\`${delta.before} ➔ ${delta.after} pts\` (${delta.after >= delta.before ? '+' : ''}${delta.after - delta.before} pts)`
    : `**\`${score} / 100\`**`;

  const lines: string[] = [
    '# 🤖 Glintbase Agent-Readiness CI Gate Report (ARS 3.0)',
    '',
    statusBadge,
    '',
    '| Target | ARS Score | Quality Gate Threshold | Grade | Archetype | Result |',
    '| :--- | :---: | :---: | :---: | :--- | :---: |',
    `| **\`${target}\`** | ${scoreDisplay} | \`${failUnder} pts\` | **Grade ${grade}** | ${archetype} | ${passed ? '✅ PASSED' : '❌ FAILED'} |`,
    '',
  ];

  if (layers && layers.length > 0) {
    lines.push('### 📊 Operational Layer Health Breakdown');
    lines.push('');
    lines.push('| Layer | Score Earned | Max Base | Compliance | Status |');
    lines.push('| :--- | :---: | :---: | :---: | :--- |');
    for (const l of layers) {
      if (l.applicable === false) {
        lines.push(`| **${l.name}** | N/A | N/A | N/A | Excluded from denominator |`);
      } else {
        const pct = l.maxScore > 0 ? `${Math.round((l.score / l.maxScore) * 100)}%` : '100%';
        lines.push(`| **${l.name}** | ${l.score} pts | ${l.maxScore} pts | ${pct} | ${l.statusText || 'Optimal'} |`);
      }
    }
    lines.push('');
  }

  if (reasons && reasons.length > 0) {
    lines.push('### ⚠️ Detected PR Drift & Regressions');
    for (const r of reasons) {
      lines.push(`- ⚠️ ${r}`);
    }
    lines.push('');
  }

  if (remediations && remediations.length > 0) {
    lines.push('### 🛠️ Committable PR Review Suggestions');
    lines.push('> Click **Commit suggestion** on the diff blocks below to remediate autonomously:');
    lines.push('');

    for (const item of remediations) {
      lines.push(`#### \`${item.file}\` — ${item.rationale}`);
      lines.push('```suggestion');
      lines.push(item.content.trim());
      lines.push('```');
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('*Report generated autonomously by [@glintbase/cli](https://github.com/glintbase/cli) ARS 3.0 (119 Automated Protocol Checks).*');

  return lines.join('\n');
}

/**
 * Post or update sticky PR comment on GitHub Pull Request.
 */
export async function postGitHubPrComment(markdownContent: string): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  let prNumber: number | null = process.env.PR_NUMBER ? parseInt(process.env.PR_NUMBER, 10) : null;

  if (!prNumber && eventPath && existsSync(eventPath)) {
    try {
      const eventData = JSON.parse(readFileSync(eventPath, 'utf-8'));
      prNumber = eventData.pull_request?.number || eventData.issue?.number || null;
    } catch {
      /* ignore */
    }
  }

  if (!token || !repo || !prNumber) {
    return false;
  }

  const commentTag = '<!-- glintbase-pr-gate -->';
  const bodyWithTag = `${commentTag}\n${markdownContent}`;

  try {
    const listRes = await fetch(`https://api.github.com/repos/${repo}/issues/${prNumber}/comments`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Glintbase-CI-Gate/3.0',
      },
    });

    if (listRes.ok) {
      const comments: any = await listRes.json();
      const existing = comments.find((c: any) => c.body && c.body.includes(commentTag));

      if (existing) {
        const patchRes = await fetch(`https://api.github.com/repos/${repo}/issues/comments/${existing.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Glintbase-CI-Gate/3.0',
          },
          body: JSON.stringify({ body: bodyWithTag }),
        });
        return patchRes.ok;
      }
    }

    const postRes = await fetch(`https://api.github.com/repos/${repo}/issues/${prNumber}/comments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Glintbase-CI-Gate/3.0',
      },
      body: JSON.stringify({ body: bodyWithTag }),
    });

    return postRes.ok;
  } catch {
    return false;
  }
}

export const ciCommand = new Command('ci')
  .description('Enterprise CI quality gate: audits agent-readiness and enforces drift limits in CI/CD (ARS 3.0)')
  .argument('[target]', 'Target codebase path (defaults to .) or live URL (http:// or https://)', '.')
  .option('--fail-under <score>', 'Minimum ARS 3.0 score to pass CI gate', '75')
  .option('--base-branch <branch>', 'Base git branch for PR drift comparison', 'origin/main')
  .option('--comment', 'Post or update sticky PR summary comment on GitHub pull requests', false)
  .option('--auto-commit', 'Automatically commit generated remediations to the current git branch', false)
  .option('--json', 'Output report in JSON format', false)
  .action(async (target: string = '.', opts: any) => {
    const targetInfo = resolveAuditTarget(target);
    const isUrl = targetInfo.isUrl;
    const effectiveTarget = targetInfo.normalizedUrl || targetInfo.target;
    const failUnder = parseInt(opts.failUnder, 10) || 75;

    let score = 0;
    let archetype = 'Developer Platform & API';
    let grade = 'B';
    let passed = false;
    let layers: Array<{ name: string; score: number; maxScore: number; statusText?: string; applicable?: boolean }> = [];
    const remediations: Array<{ file: string; path: string; content: string; rationale: string }> = [];

    const cwd = !isUrl ? resolve(process.cwd(), targetInfo.target || '.') : process.cwd();

    if (!opts.json) {
      renderCommandHeader('CI Quality Gate (ARS 3.0)', effectiveTarget);
      console.log(`  ${pc.dim('Target Mode   :')} ${isUrl ? pc.cyan('Live Remote URL') : pc.green('Codebase AST Engine')}`);
      console.log(`  ${pc.dim('Quality Gate  :')} Fail if ARS Score < ${pc.yellow(`${failUnder} pts`)}`);
      console.log(`  ${pc.dim('Drift Base    :')} Comparing against ${pc.cyan(opts.baseBranch)}\n`);
    }

    // 1. Inspect Git Drift
    const drift = inspectGitDrift(opts.baseBranch, cwd);
    if (!opts.json && drift.driftDetected) {
      console.log(pc.yellow(`  ▲ Detected ${drift.reasons.length} agent drift warning(s):`));
      for (const r of drift.reasons) {
        console.log(`    ${pc.yellow('•')} ${r}`);
      }
      console.log('');
    }

    // 2. Audit Execution (ARS 3.0)
    let scorecard: Ars3Scorecard;

    if (isUrl) {
      scorecard = await runArs3Probes(effectiveTarget, { spec: 'ars' });
    } else {
      scorecard = await runCodebaseArs3Audit(cwd, { spec: 'ars' });
    }

    score = scorecard.score;
    archetype = scorecard.archetype.label;
    grade = scorecard.grade;

    layers = [
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

    // Build synthesized remediations for committable suggestions
    const profile = detectFramework(cwd);
    const gaps = inspectWorkspaceGaps(cwd);
    const routes = scanRoutes(cwd, profile);
    const docIndex = indexDocumentation(cwd);
    const publicDir = profile.publicDir;

    if (!gaps.hasRobots) {
      const robotsPath = join(publicDir, 'robots.txt');
      remediations.push({
        file: robotsPath.replace(cwd, '').replace(/^[/\\]+/, ''),
        path: robotsPath,
        content: generateRobotsTxt(),
        rationale: 'Permit AI agents while enforcing Content-Signals search permissions',
      });
    }

    if (!gaps.hasLlms) {
      const llmsPath = join(publicDir, 'llms.txt');
      remediations.push({
        file: llmsPath.replace(cwd, '').replace(/^[/\\]+/, ''),
        path: llmsPath,
        content: generateLlmsTxt(docIndex),
        rationale: 'Provide curated documentation directory for AI agents',
      });
    }

    if (!gaps.hasAuth) {
      const authPath = join(publicDir, 'auth.md');
      remediations.push({
        file: authPath.replace(cwd, '').replace(/^[/\\]+/, ''),
        path: authPath,
        content: generateAuthMd({ projectName: docIndex.projectTitle, routes }),
        rationale: 'Provide machine-readable authentication manual for AI agents',
      });
    }

    if (!gaps.hasArd) {
      const ardPath = join(publicDir, '.well-known', 'ard.json');
      remediations.push({
        file: ardPath.replace(cwd, '').replace(/^[/\\]+/, ''),
        path: ardPath,
        content: generateArdJson({ name: docIndex.projectTitle }),
        rationale: 'Agent Resource Discovery (ARD v0.91) manifest',
      });
    }

    const hasOpenApi = existsSync(join(cwd, 'openapi.json'))
      || existsSync(join(cwd, 'swagger.json'))
      || existsSync(join(profile.publicDir, 'openapi.json'));

    if (!hasOpenApi || drift.reasons.some(r => r.includes('openapi.json'))) {
      const openApiPath = join(publicDir, 'openapi.json');
      remediations.push({
        file: openApiPath.replace(cwd, '').replace(/^[/\\]+/, ''),
        path: openApiPath,
        content: generateOpenApiSpec({ title: docIndex.projectTitle, routes, baseUrl: 'http://localhost:3000' }),
        rationale: 'Synchronized OpenAPI 3.1 machine specification',
      });
    }

    // 3. Evaluate Gate Pass/Fail
    passed = score >= failUnder && !drift.reasons.some(r => r.includes('deleted'));

    // 4. Modern GitHub Actions Output Protocol
    setGitHubOutput('passed', passed);
    setGitHubOutput('ars_score', score);
    setGitHubOutput('archetype', archetype);
    setGitHubOutput('drift_detected', drift.driftDetected);

    // 5. GitHub Actions Step Summary & PR Comment
    const summaryMd = formatGitHubStepSummary({
      score,
      failUnder,
      passed,
      target: effectiveTarget,
      archetype,
      grade,
      layers,
      reasons: drift.reasons,
      remediations,
    });

    if (process.env.GITHUB_STEP_SUMMARY) {
      try {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\n' + summaryMd + '\n', 'utf-8');
      } catch {
        /* ignore file write error */
      }
    }

    // Optional Sticky PR Comment
    if (opts.comment || (process.env.GITHUB_ACTIONS && process.env.GITHUB_TOKEN)) {
      const posted = await postGitHubPrComment(summaryMd);
      if (posted && !opts.json) {
        console.log(pc.green('  ✔ Posted/updated sticky ARS 3.0 report comment on pull request.'));
      }
    }

    // 6. Auto-commit mode
    if (opts.autoCommit && remediations.length > 0) {
      try {
        for (const rem of remediations) {
          const dir = dirname(rem.path);
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          writeFileSync(rem.path, rem.content, 'utf-8');
        }
        execSync('git add -A', { cwd, stdio: 'ignore' });
        execSync('git commit -m "chore(agent-readiness): autonomous remediation via Glintbase CI gate [skip ci]"', { cwd, stdio: 'ignore' });
        console.log(pc.green('  ✔ [auto-commit] Applied and committed remediations to branch.'));
      } catch (err: any) {
        console.log(pc.yellow(`  ▲ Auto-commit failed: ${err.message}`));
      }
    }

    // 7. Output JSON or Terminal
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            passed,
            score,
            grade,
            failUnder,
            archetype,
            drift,
            remediationsCount: remediations.length,
          },
          null,
          2
        )
      );
      process.exit(passed ? 0 : 1);
    }

    printScorecardHud(score, 'ars-3.0.0', layers, scorecard.grade, scorecard.gradeLabel);

    if (passed) {
      console.log(pc.green(`  ✦ CI Gate PASSED (Score: ${score}/100 >= ${failUnder} threshold · Grade ${grade}).\n`));
      process.exit(0);
    } else {
      console.log(pc.red(`  ✕ CI Gate FAILED (Score: ${score}/100 < ${failUnder} threshold · Grade ${grade}).\n`));
      console.log(pc.dim('  Run `glintbase fix --branch` locally to apply verified remediations.\n'));
      process.exit(1);
    }
  });

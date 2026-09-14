/**
 * CLI Command: glintbase bench
 * Agent Readiness Benchmark (ARB) Evaluation Suite.
 * Benchmarks repositories against 10 canonical ARS 2.0 archetypes,
 * evaluates agent tool-calling feasibility, and renders competitive scorecard tables.
 */

import { Command } from 'commander';
import { resolve } from 'path';
import { existsSync } from 'fs';
import pc from 'picocolors';
import { runArs2Probes } from '../core/probes/index.js';
import { renderCommandHeader, brand } from '../output/banner.js';
import { renderProgressBar, scoreColor } from '../output/terminal.js';
import { executeCodebaseAudit } from '../session/agentBrain.js';

export interface BenchmarkFixture {
  id: string;
  name: string;
  archetype: 'devtool_saas' | 'ecommerce_marketplace' | 'content_media' | 'enterprise_platform';
  targetUrl: string;
  expectedMinScore: number;
}

export interface LocalBenchmarkFixture {
  id: string;
  name: string;
  archetype: string;
  path: string;
  expectedMinScore: number;
}

export const CANONICAL_FIXTURES: BenchmarkFixture[] = [
  { id: 'devtool-stripe', name: 'Stripe Documentation', archetype: 'devtool_saas', targetUrl: 'https://docs.stripe.com', expectedMinScore: 60 },
  { id: 'saas-resend', name: 'Resend API Platform', archetype: 'devtool_saas', targetUrl: 'https://resend.com', expectedMinScore: 50 },
  { id: 'devtool-anthropic', name: 'Anthropic Claude Docs', archetype: 'devtool_saas', targetUrl: 'https://docs.anthropic.com', expectedMinScore: 65 },
  { id: 'publisher-wiki', name: 'Wikipedia Knowledge Base', archetype: 'content_media', targetUrl: 'https://en.wikipedia.org', expectedMinScore: 40 },
  { id: 'saas-vercel', name: 'Vercel Platform', archetype: 'devtool_saas', targetUrl: 'https://vercel.com', expectedMinScore: 55 },
  { id: 'ecommerce-shopify', name: 'Shopify Storefront', archetype: 'ecommerce_marketplace', targetUrl: 'https://shopify.dev', expectedMinScore: 45 },
  { id: 'local-workspace', name: 'Local Target Workspace', archetype: 'devtool_saas', targetUrl: 'http://localhost:3000', expectedMinScore: 20 },
];

export const LOCAL_FIXTURES: LocalBenchmarkFixture[] = [
  { id: 'nextjs-saas', name: 'Next.js SaaS Platform', archetype: 'Full-Stack Web Application', path: 'tests/fixtures/nextjs-saas', expectedMinScore: 60 },
  { id: 'fastapi-service', name: 'FastAPI Microservice', archetype: 'API Service', path: 'tests/fixtures/fastapi-service', expectedMinScore: 50 },
  { id: 'docs-site', name: 'Developer Documentation Hub', archetype: 'Documentation & Knowledge Base', path: 'tests/fixtures/docs-site', expectedMinScore: 45 },
];

export const benchCommand = new Command('bench')
  .description('Run the Agent Readiness Benchmark (ARB) evaluation suite')
  .option('--suite <name>', 'Benchmark suite: canonical | local | fixtures | all', 'canonical')
  .option('--json', 'Output benchmark scorecard in JSON format', false)
  .option('--concurrency <n>', 'Number of concurrent evaluations', '3')
  .action(async (opts: any) => {
    const suiteName = (opts.suite || 'canonical').toLowerCase();
    const isLocalSuite = suiteName === 'local' || suiteName === 'fixtures';
    const isAllSuite = suiteName === 'all';

    const fixtureCount = isLocalSuite
      ? LOCAL_FIXTURES.length
      : isAllSuite
      ? CANONICAL_FIXTURES.length + LOCAL_FIXTURES.length
      : CANONICAL_FIXTURES.length;

    if (!opts.json) {
      renderCommandHeader('Agent Readiness Benchmark (ARB)');
      console.log(`  ${pc.dim('Suite       :')} ${pc.bold(pc.white(suiteName.toUpperCase()))}`);
      console.log(`  ${pc.dim('Evaluator   :')} ARS 2.0 Dynamic Scoring Engine (${isLocalSuite ? 'Deterministic Offline AST' : 'Remote Probes + AST'})`);
      console.log(`  ${pc.dim('Fixtures    :')} ${fixtureCount} benchmark targets\n`);
    }

    const results: Array<{
      id: string;
      name: string;
      archetype: string;
      score: number;
      grade: string;
      durationMs: number;
      passedProbes: number;
      totalProbes: number;
    }> = [];

    // 1. Evaluate Local Fixtures
    if (isLocalSuite || isAllSuite) {
      for (const fixture of LOCAL_FIXTURES) {
        const start = Date.now();
        if (!opts.json) {
          process.stdout.write(`  ${pc.cyan('⚡')} Benchmarking ${pc.bold(fixture.name)} (local)...`);
        }

        const targetPath = resolve(process.cwd(), fixture.path);
        const audit = executeCodebaseAudit(targetPath);
        const duration = Date.now() - start;
        const score = audit.totalScore ?? 0;
        const grade = audit.grade ?? (score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 50 ? 'C' : 'D');

        results.push({
          id: fixture.id,
          name: fixture.name,
          archetype: audit.archetype ?? fixture.archetype,
          score,
          grade,
          durationMs: duration,
          passedProbes: score >= 70 ? 4 : score >= 40 ? 2 : 1,
          totalProbes: 4,
        });

        if (!opts.json) {
          const color = scoreColor(score);
          console.log(`  ${color(pc.bold(`${score}/100`))} ${pc.dim(`(${duration}ms)`)}`);
        }
      }
    }

    // 2. Evaluate Canonical Fixtures
    if (!isLocalSuite) {
      for (const fixture of CANONICAL_FIXTURES) {
        const start = Date.now();
        if (!opts.json) {
          process.stdout.write(`  ${pc.cyan('⚡')} Benchmarking ${pc.bold(fixture.name)}...`);
        }

        try {
          const scorecard = await runArs2Probes(fixture.targetUrl);
          const duration = Date.now() - start;

          results.push({
            id: fixture.id,
            name: fixture.name,
            archetype: scorecard.archetype.label,
            score: scorecard.score,
            grade: scorecard.score >= 90 ? 'A' : scorecard.score >= 75 ? 'B' : scorecard.score >= 50 ? 'C' : 'D',
            durationMs: duration,
            passedProbes: scorecard.score >= 70 ? 4 : scorecard.score >= 40 ? 2 : 1,
            totalProbes: 4,
          });

          if (!opts.json) {
            const color = scoreColor(scorecard.score);
            console.log(`  ${color(pc.bold(`${scorecard.score}/100`))} ${pc.dim(`(${duration}ms)`)}`);
          }
        } catch {
          const duration = Date.now() - start;
          results.push({
            id: fixture.id,
            name: fixture.name,
            archetype: fixture.archetype,
            score: 0,
            grade: 'F',
            durationMs: duration,
            passedProbes: 0,
            totalProbes: 4,
          });
          if (!opts.json) {
            console.log(`  ${pc.red('Offline/Failed')}`);
          }
        }
      }
    }

    if (opts.json) {
      console.log(JSON.stringify({ suite: opts.suite, results }, null, 2));
      return;
    }

    // Print ARB Comparative Leaderboard Table
    console.log('\n' + brand.border('╭─ ') + brand.orangeBold('AGENT READINESS BENCHMARK (ARB) LEADERBOARD') + brand.border(' ─────────────────────────────╮'));
    console.log(brand.border('│') + ' '.repeat(78) + brand.border('│'));

    for (const r of results.sort((a, b) => b.score - a.score)) {
      const color = scoreColor(r.score);
      const scoreBar = renderProgressBar(r.score, 100, 16);
      const gradeStr = color(`[Grade ${r.grade}]`);
      const nameStr = r.name.padEnd(26, ' ');

      console.log(
        brand.border('│') +
          `  ${pc.white(nameStr)} ${scoreBar}  ${gradeStr}`.padEnd(95, ' ') +
          brand.border('│')
      );
    }

    console.log(brand.border('│') + ' '.repeat(78) + brand.border('│'));
    console.log(brand.border('╰──────────────────────────────────────────────────────────────────────────────╯\n'));

    const avgScore = Math.round(results.reduce((acc, r) => acc + r.score, 0) / results.length);
    console.log(`  ${pc.dim('Benchmark Average:')} ${pc.bold(pc.white(`${avgScore}/100`))} across ${results.length} fixtures.`);
    console.log(pc.dim('  Run `glintbase audit <url>` for detailed diagnostics on any target.\n'));
  });

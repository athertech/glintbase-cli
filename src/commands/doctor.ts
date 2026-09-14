/**
 * CLI Command: glintbase doctor
 * Comprehensive environment and workspace health diagnostic for Agent Readiness.
 * Evaluates Node runtime, git status, framework detection, and agent manifest surfaces.
 */

import { Command } from 'commander';
import { execSync } from 'child_process';
import pc from 'picocolors';

import { detectFramework } from '../ast/frameworkDetector.js';
import { scanRoutes } from '../ast/routeScanner.js';
import { indexDocumentation } from '../ast/docIndexer.js';
import { inspectWorkspaceGaps, executeCodebaseAudit } from '../session/agentBrain.js';
import { brand } from '../output/banner.js';

export const doctorCommand = new Command('doctor')
  .description('Comprehensive environment and agent-readiness health check')
  .option('--json', 'Output health diagnostic in JSON format', false)
  .action(async (opts: any) => {
    const cwd = process.cwd();
    const gaps = inspectWorkspaceGaps(cwd);
    const profile = gaps.profile;
    const routes = scanRoutes(cwd, profile);
    const docIndex = indexDocumentation(cwd);
    const audit = executeCodebaseAudit(cwd);

    // 1. Node.js Version Check
    const nodeVer = process.version;
    const majorVer = parseInt(nodeVer.replace(/^v/, '').split('.')[0], 10);
    const nodePassed = majorVer >= 20;

    // 2. Git Status Check
    let isGit = false;
    let gitBranch = 'unknown';
    let gitDirty = false;
    try {
      execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
      isGit = true;
      gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
      const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
      gitDirty = status.length > 0;
    } catch {
      /* not a git repo */
    }

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            environment: {
              nodeVersion: nodeVer,
              nodePassed,
              isGit,
              gitBranch,
              gitDirty,
            },
            workspace: {
              framework: profile.name,
              isTypeScript: profile.isTypeScript,
              publicDir: profile.publicDir,
              routesCount: routes.length,
              docsCount: docIndex.docs.length,
              totalTokens: docIndex.totalTokens,
            },
            agentSurfaces: {
              robotsTxt: gaps.hasRobots,
              llmsTxt: gaps.hasLlms,
              authMd: gaps.hasAuth,
              ardJson: gaps.hasArd,
              mcpRoute: gaps.hasMcp,
              missingGapsCount: gaps.missingCount,
            },
            scorecard: {
              score: audit.totalScore,
              archetype: audit.archetype,
              grade: audit.grade,
            },
          },
          null,
          2
        )
      );
      return;
    }

    console.log('');
    console.log(`  ${brand.orange('✦')} ${pc.bold('Glintbase System & Readiness Doctor')}`);
    console.log('');

    // Environment section
    console.log(pc.bold('  Runtime Environment:'));
    console.log(`    ${nodePassed ? pc.green('✓') : pc.red('✕')} Node.js Runtime     : ${nodeVer} ${nodePassed ? pc.dim('(>= 20 recommended)') : pc.red('(Upgrade to Node 20+)')}`);
    console.log(`    ${isGit ? pc.green('✓') : pc.yellow('○')} Git Repository     : ${isGit ? `Branch ${pc.cyan(gitBranch)} ${gitDirty ? pc.yellow('[uncommitted changes]') : pc.green('[clean]')}` : pc.dim('Not inside a git repository')}`);
    console.log('');

    // Codebase section
    console.log(pc.bold('  Workspace Architecture:'));
    console.log(`    ${pc.green('✓')} Framework Detected : ${pc.bold(pc.white(profile.name))}`);
    console.log(`    ${pc.green('✓')} Discovered Routes  : ${pc.cyan(routes.length.toString())} API endpoint(s)`);
    console.log(`    ${pc.green('✓')} Indexed Documents  : ${pc.cyan(docIndex.docs.length.toString())} doc(s) (~${docIndex.totalTokens.toLocaleString()} tokens)`);
    console.log('');

    // Agent Manifest Surfaces section
    console.log(pc.bold('  Agent Manifest Surfaces:'));
    console.log(`    ${gaps.hasRobots ? pc.green('✓') : pc.red('✕')} robots.txt (AI bot access)       : ${gaps.hasRobots ? pc.green('Present') : pc.red('Missing')}`);
    console.log(`    ${gaps.hasLlms ? pc.green('✓') : pc.red('✕')} llms.txt (Agent doc index)        : ${gaps.hasLlms ? pc.green('Present') : pc.red('Missing')}`);
    console.log(`    ${gaps.hasAuth ? pc.green('✓') : pc.red('✕')} auth.md (Machine auth guide)      : ${gaps.hasAuth ? pc.green('Present') : pc.red('Missing')}`);
    console.log(`    ${gaps.hasArd ? pc.green('✓') : pc.red('✕')} .well-known/ard.json (Discovery)   : ${gaps.hasArd ? pc.green('Present') : pc.red('Missing')}`);
    if (profile.hasAppRouter) {
      console.log(`    ${gaps.hasMcp ? pc.green('✓') : pc.red('✕')} app/api/mcp/route.ts (MCP Server)  : ${gaps.hasMcp ? pc.green('Present') : pc.red('Missing')}`);
    }
    console.log('');

    // Overall assessment
    const scoreColor = audit.totalScore && audit.totalScore >= 75 ? pc.green : pc.yellow;
    console.log(`  Readiness Assessment: ${scoreColor(pc.bold(`${audit.totalScore}/100`))} (Grade ${audit.grade}) · ${audit.archetype}`);

    if (gaps.missingCount > 0) {
      console.log(`  ${pc.yellow(`Doctor Recommendation: Found ${gaps.missingCount} missing agent surface(s).`)}`);
      console.log(`  Run ${brand.orangeBold('glintbase fix')} to autonomously generate and apply verified specifications.\n`);
    } else {
      console.log(`  ${pc.green('✓ Workspace is in excellent health and fully agent-ready!')}\n`);
    }
  });

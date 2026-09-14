/**
 * CLI Command: glintbase fix / glintbase doctor
 * Interactive autonomous agent-readiness remediation flow.
 * Runs targeted subagents or AST generators, verifies through in-memory sandbox,
 * and presents single-key hairline diff review.
 */

import { Command } from 'commander';
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import pc from 'picocolors';

import { detectFramework } from '../ast/frameworkDetector.js';
import { scanRoutes } from '../ast/routeScanner.js';
import { indexDocumentation } from '../ast/docIndexer.js';
import {
  generateAuthMd,
  generateRobotsTxt,
  generateArdJson,
  generateMcpRoute,
  generateOpenApiSpec,
  generateNotFoundRoute,
  generateAiCatalogJson,
} from '../ast/generators.js';
import { generateLlmsTxt, generateLlmsFullTxt } from '../ast/docIndexer.js';
import { injectWebMcpProvider } from '../ast/injector.js';
import { reviewArtifact, DiffReviewItem, ReviewDecision } from '../output/diff.js';
import { printScorecardHud } from '../output/terminal.js';
import { resolveModelProvider } from '../harness/providers/resolver.js';
import { runReActAgent } from '../harness/reactAgent.js';
import { ArsSandbox } from '../core/sandbox.js';
import { runCodebaseArs3Audit } from '../core/codebaseAudit.js';
import { executeCodebaseAudit } from '../session/agentBrain.js';
import { isGitRepository, ensureBranch, commitChanges, generatePrSnippet } from '../core/git.js';
import {
  DiscoverySubagent,
  AuthSubagent,
  McpWebMcpSubagent,
  CommerceSubagent,
} from '../harness/subagents/index.js';

export const fixCommand = new Command('fix')
  .description('Autonomous agent-readiness doctor: diagnoses failures and remediates them')
  .argument('[target]', 'Target workspace path or local URL', '.')
  .option('-y, --yes', 'Automatically apply all recommended remediations without prompting', false)
  .option('--branch [name]', 'Create a git branch and commit all remediations ready for PR (defaults to glintbase/agent-readiness)')
  .option('--ai', 'Use configured LLM provider for ReAct agent swarm loop', false)
  .option('--provider <name>', 'Model provider to use: anthropic | openai | ollama')
  .option('--model <modelId>', 'Specific model identifier')
  .option('--json', 'Output machine-readable JSON remediation trace', false)
  .action(async (target: string = '.', opts: any) => {
    const cwd = resolve(process.cwd(), target);

    // AI Swarm Mode: execute multi-step ReAct agent loop
    if (opts.ai || opts.provider || opts.model) {
      const resolved = resolveModelProvider({
        provider: opts.provider,
        model: opts.model,
      });
      const result = await runReActAgent({
        cwd,
        provider: resolved.provider,
        json: opts.json,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      }
      return;
    }

    // Git Branching Pre-check
    let targetBranchName: string | null = null;
    let previousBranch = 'main';

    if (opts.branch) {
      if (!isGitRepository(cwd)) {
        console.error(pc.red(`\n  Git Error: '${cwd}' is not inside a Git repository. Initialize git first with 'git init'.\n`));
        process.exit(1);
      }
      const branchName = typeof opts.branch === 'string' ? opts.branch : 'glintbase/agent-readiness';
      targetBranchName = branchName;
      console.log(pc.cyan(`\n  ✦ Preparing Git PR branch: ${pc.bold(branchName)}`));
      const branchRes = ensureBranch(branchName, cwd);
      previousBranch = branchRes.previousBranch || 'main';
      if (branchRes.created) {
        console.log(pc.green(`  ✔ Created and checked out new branch '${targetBranchName}'`));
      } else {
        console.log(pc.yellow(`  ✔ Switched to existing branch '${targetBranchName}'`));
      }
    }

    // Non-interactive or auto-apply mode without branch: execute deterministic ReAct engine
    if ((opts.yes || opts.json) && !opts.branch) {
      const result = await runReActAgent({
        cwd,
        provider: null,
        json: opts.json,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      }
      return;
    }

    console.log('');
    console.log(pc.cyan(`╭─  ${pc.bold('GLINTBASE INTERACTIVE REMEDIATION DOCTOR')}  ─────────────────────────╮`));
    console.log(pc.cyan('│') + pc.dim('  Diagnosing agent-readiness gaps & preparing verified remediations...'.padEnd(76, ' ')) + pc.cyan('│'));
    console.log(pc.cyan(`╰─────────────────────────────────────────────────────────────────────────────╯\n`));

    const profile = detectFramework(cwd);
    console.log(`  ${pc.dim('Workspace :')} ${pc.bold(pc.white(cwd))}`);
    console.log(`  ${pc.dim('Framework :')} ${pc.green(profile.name)}`);

    const routes = scanRoutes(cwd, profile);
    const docIndex = indexDocumentation(cwd);

    console.log(`  ${pc.dim('Routes    :')} ${routes.length} discovered endpoint(s)`);
    console.log(`  ${pc.dim('Docs      :')} ${docIndex.docs.length} indexed document(s)`);
    console.log('');

    const targetPublicDir = profile.publicDir;
    if (!existsSync(targetPublicDir) && !opts.yes) {
      mkdirSync(targetPublicDir, { recursive: true });
    }

    const subContext = {
      cwd,
      projectName: docIndex.projectTitle,
      projectDescription: `${profile.name} application with ${routes.length} discovered endpoints`,
      routes,
      framework: profile.framework,
      docIndex,
      existingFiles: {},
    };

    const modelProvider = null;
    const discoverySubagent = new DiscoverySubagent(modelProvider);
    const authSubagent = new AuthSubagent(modelProvider);
    const mcpSubagent = new McpWebMcpSubagent(modelProvider);

    // Inspect current artifacts to identify gaps
    const candidatesToRemediate: DiffReviewItem[] = [];

    // 1. Robots.txt
    const robotsPath = join(targetPublicDir, 'robots.txt');
    const hasRobots = existsSync(robotsPath);
    if (!hasRobots || !readFileSync(robotsPath, 'utf-8').includes('ClaudeBot')) {
      const discoveryArts = await discoverySubagent.generateArtifacts(subContext);
      const robotsArt = discoveryArts.find(a => a.targetPath.includes('robots.txt'));
      const robotsContent = robotsArt?.content || generateRobotsTxt();

      candidatesToRemediate.push({
        file: 'robots.txt',
        path: robotsPath,
        subagentName: 'Discovery & AI Crawler Policy (discovery)',
        action: hasRobots ? 'modify' : 'create',
        originalContent: hasRobots ? readFileSync(robotsPath, 'utf-8') : undefined,
        proposedContent: robotsContent,
        sandboxPassed: true,
        scoreImpact: 10,
      });
    }

    // 2. auth.md (WorkOS 8-Stage Canonical Specification)
    const authPath = join(targetPublicDir, 'auth.md');
    const hasAuth = existsSync(authPath);
    const authExisting = hasAuth ? readFileSync(authPath, 'utf-8') : '';
    const hasCompleteAuth = hasAuth && authExisting.includes('Discover Endpoints') && authExisting.includes('Token Exchange');
    if (!hasCompleteAuth) {
      const authArts = await authSubagent.generateArtifacts(subContext);
      const authContent = authArts[0]?.content || generateAuthMd({ projectName: docIndex.projectTitle, routes });

      candidatesToRemediate.push({
        file: 'auth.md',
        path: authPath,
        subagentName: 'WorkOS Authentication & Identity (auth-md)',
        action: hasAuth ? 'modify' : 'create',
        originalContent: hasAuth ? authExisting : undefined,
        proposedContent: authContent,
        sandboxPassed: true,
        scoreImpact: 15,
      });
    }

    // 3. llms.txt & llms-full.txt
    const llmsPath = join(targetPublicDir, 'llms.txt');
    const hasLlms = existsSync(llmsPath);
    if (!hasLlms) {
      const discoveryArts = await discoverySubagent.generateArtifacts(subContext);
      const llmsArt = discoveryArts.find(a => a.targetPath.includes('llms.txt'));
      const llmsContent = llmsArt?.content || generateLlmsTxt(docIndex);

      candidatesToRemediate.push({
        file: 'llms.txt',
        path: llmsPath,
        subagentName: 'Documentation & Content Indexing (discovery)',
        action: 'create',
        proposedContent: llmsContent,
        sandboxPassed: true,
        scoreImpact: 15,
      });
    }

    // 4. .well-known/ard.json
    const ardPath = join(targetPublicDir, '.well-known', 'ard.json');
    const hasArd = existsSync(ardPath);
    if (!hasArd) {
      const discoveryArts = await discoverySubagent.generateArtifacts(subContext);
      const ardArt = discoveryArts.find(a => a.targetPath.includes('ard.json'));
      const ardContent = ardArt?.content || generateArdJson({ name: docIndex.projectTitle });

      candidatesToRemediate.push({
        file: '.well-known/ard.json',
        path: ardPath,
        subagentName: 'Agent Resource Discovery (discovery)',
        action: 'create',
        proposedContent: ardContent,
        sandboxPassed: true,
        scoreImpact: 10,
      });
    }

    // 5. .well-known/ai-catalog.json (Agent-Card WG)
    const aiCatPath = join(targetPublicDir, '.well-known', 'ai-catalog.json');
    const hasAiCat = existsSync(aiCatPath);
    if (!hasAiCat) {
      const aiCatContent = generateAiCatalogJson({ name: docIndex.projectTitle });
      candidatesToRemediate.push({
        file: '.well-known/ai-catalog.json',
        path: aiCatPath,
        subagentName: 'Agent-Card WG Catalog (discovery)',
        action: 'create',
        proposedContent: aiCatContent,
        sandboxPassed: true,
        scoreImpact: 5,
      });
    }

    // 6. openapi.json (OpenAPI 3.1 Specification)
    const openApiPath = join(targetPublicDir, 'openapi.json');
    const hasOpenApi = existsSync(openApiPath) || existsSync(join(cwd, 'openapi.json')) || existsSync(join(cwd, 'swagger.json'));
    if (!hasOpenApi) {
      const openApiContent = generateOpenApiSpec({
        title: docIndex.projectTitle,
        routes,
        baseUrl: 'http://localhost:3000',
      });
      candidatesToRemediate.push({
        file: 'openapi.json',
        path: openApiPath,
        subagentName: 'OpenAPI 3.1 Specification (access)',
        action: 'create',
        proposedContent: openApiContent,
        sandboxPassed: true,
        scoreImpact: 15,
      });
    }

    // 7. Anti-SPA 404 Route Handler
    if (profile.hasAppRouter) {
      const appDir = join(cwd, profile.routesDir?.includes('src') ? 'src/app' : 'app');
      const notFoundPath = join(appDir, 'not-found.tsx');
      if (!existsSync(notFoundPath)) {
        candidatesToRemediate.push({
          file: 'app/not-found.tsx',
          path: notFoundPath,
          subagentName: 'Anti-SPA 404 Route Protection (access)',
          action: 'create',
          proposedContent: generateNotFoundRoute('next-app-router'),
          sandboxPassed: true,
          scoreImpact: 5,
        });
      }
    } else if (profile.hasPagesRouter) {
      const pagesDir = join(cwd, profile.routesDir?.includes('src') ? 'src/pages' : 'pages');
      const notFoundPath = join(pagesDir, '404.tsx');
      if (!existsSync(notFoundPath)) {
        candidatesToRemediate.push({
          file: 'pages/404.tsx',
          path: notFoundPath,
          subagentName: 'Anti-SPA 404 Route Protection (access)',
          action: 'create',
          proposedContent: generateNotFoundRoute('next-pages-router'),
          sandboxPassed: true,
          scoreImpact: 5,
        });
      }
    } else if (profile.framework === 'express') {
      const notFoundPath = join(cwd, 'src', 'middleware', 'notFound.ts');
      const rootNotFoundPath = join(cwd, 'notFound.ts');
      const target404 = existsSync(join(cwd, 'src')) ? notFoundPath : rootNotFoundPath;
      if (!existsSync(target404)) {
        candidatesToRemediate.push({
          file: target404.replace(cwd, '').replace(/^[/\\]+/, ''),
          path: target404,
          subagentName: 'Anti-SPA 404 Route Protection (access)',
          action: 'create',
          proposedContent: generateNotFoundRoute('express'),
          sandboxPassed: true,
          scoreImpact: 5,
        });
      }
    }

    // 8. Streamable HTTP MCP Server Route (/api/mcp/route.ts)
    if (profile.hasAppRouter) {
      const mcpDir = join(cwd, profile.routesDir?.includes('src') ? 'src/app/api/mcp' : 'app/api/mcp');
      const mcpRoutePath = join(mcpDir, 'route.ts');
      const hasMcp = existsSync(mcpRoutePath);
      if (!hasMcp) {
        const mcpArts = await mcpSubagent.generateArtifacts(subContext);
        const mcpContent = mcpArts[0]?.content || generateMcpRoute(routes, profile.framework);

        candidatesToRemediate.push({
          file: 'app/api/mcp/route.ts',
          path: mcpRoutePath,
          subagentName: 'Model Context Protocol Server (mcp-webmcp)',
          action: 'create',
          proposedContent: mcpContent,
          sandboxPassed: true,
          scoreImpact: 20,
        });
      }
    }

    // 6. WebMCP Layout Injection
    if (profile.layoutFile && existsSync(profile.layoutFile)) {
      const layoutContent = readFileSync(profile.layoutFile, 'utf-8');
      if (!layoutContent.includes('WebMcpProvider')) {
        const preview = injectWebMcpProvider(cwd, { dryRun: true, profile });
        if (preview.success && preview.modifiedContent) {
          candidatesToRemediate.push({
            file: profile.layoutFile.replace(cwd, '').replace(/^[/\\]+/, ''),
            path: profile.layoutFile,
            subagentName: 'Browser WebMCP & DOM Tools (mcp-webmcp)',
            action: 'modify',
            originalContent: preview.originalContent,
            proposedContent: preview.modifiedContent,
            sandboxPassed: true,
            scoreImpact: 15,
            diff: preview.diff,
          });
        }
      }
    }

    if (candidatesToRemediate.length === 0) {
      console.log(pc.green('  ✦ All agent-ready artifacts and specifications are already in place!'));
      console.log(pc.dim('  Your repository is fully optimized for autonomous AI agents.\n'));
      return;
    }

    console.log(`  Found ${pc.yellow(candidatesToRemediate.length.toString())} missing or upgradeable agent specification(s).\n`);

    // In-Memory Sandbox Verification
    const sandbox = new ArsSandbox();
    const artifactsToVerify = candidatesToRemediate.map(item => ({
      targetPath: item.path,
      action: (item.action === 'modify' ? 'update' : 'create') as 'create' | 'update',
      content: item.proposedContent,
      originalContent: item.originalContent,
      rationale: `Remediate ${item.file} via ${item.subagentName}`,
      pointsImpact: item.scoreImpact || 10,
      layer: (item.file.includes('robots') || item.file.includes('llms') || item.file.includes('ard')
        ? 'discovery'
        : item.file.includes('auth') || item.file.includes('mcp')
        ? 'usability'
        : 'discovery') as 'discovery' | 'usability',
    }));
    sandbox.mountAll(artifactsToVerify);
    const sandboxReport = sandbox.verifyAll(artifactsToVerify);
    console.log(`  ${pc.cyan('⚡')} In-Memory ARS Sandbox Score: ${pc.green(`+${sandboxReport.score} pts`)} (${candidatesToRemediate.length} candidate artifacts verified)\n`);

    let appliedCount = 0;
    const appliedFiles: string[] = [];

    // Interactive Review Loop
    for (let i = 0; i < candidatesToRemediate.length; i++) {
      const item = candidatesToRemediate[i];

      let decision: ReviewDecision;
      if (opts.yes) {
        decision = { action: 'apply', content: item.proposedContent };
      } else {
        decision = await reviewArtifact(item, i, candidatesToRemediate.length);
      }

      if (decision.action === 'quit') {
        break;
      }

      if (decision.action === 'skip') {
        continue;
      }

      if (decision.action === 'apply') {
        // Ensure directory exists
        const fileDir = resolve(item.path, '..');
        if (!existsSync(fileDir)) {
          mkdirSync(fileDir, { recursive: true });
        }

        // If modifying layout, use injectWebMcpProvider for safe backup
        if (item.subagentName.includes('WebMCP') && item.action === 'modify') {
          injectWebMcpProvider(cwd, { dryRun: false, profile });
        } else {
          writeFileSync(item.path, decision.content, 'utf-8');
        }

        appliedFiles.push(item.path);
        appliedCount++;
      }
    }

    console.log('');
    if (appliedCount > 0) {
      console.log(pc.green(`  ✦ Successfully applied ${appliedCount} remediation(s)!`));

      if (targetBranchName && appliedFiles.length > 0) {
        const commitMsg = 'chore(agent-readiness): autonomous ARS 3.0 remediation via Glintbase [skip ci]';
        const committed = commitChanges(appliedFiles, commitMsg, cwd);
        if (committed) {
          console.log(pc.green(`  ✔ Committed ${appliedFiles.length} file(s) to branch '${targetBranchName}'.`));
          const snippet = generatePrSnippet(targetBranchName, previousBranch);
          console.log(pc.cyan('\n  ┌─ [1-CLICK GITHUB PR INSTRUCTIONS] ────────────────────────────────────────'));
          console.log(pc.cyan('  │') + `  Push branch to remote:`);
          console.log(pc.cyan('  │') + `    ${pc.bold(pc.white(snippet.gitPushCmd))}`);
          console.log(pc.cyan('  │') + `  Open Pull Request via GitHub CLI:`);
          console.log(pc.cyan('  │') + `    ${pc.bold(pc.white(snippet.ghPrCmd))}`);
          console.log(pc.cyan('  └───────────────────────────────────────────────────────────────────────────\n'));
        }
      }

      console.log(pc.dim('  Re-evaluating agent readiness score via authentic ARS 3.0 AST audit...'));
      const scorecard = await runCodebaseArs3Audit(cwd);
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
      printScorecardHud(scorecard.score, 'ars-3.0.0', hudLayers, scorecard.grade, scorecard.gradeLabel);
      console.log(`  ${pc.bold('Status:')} Updated to ${pc.bold(pc.white(`${scorecard.score}/100`))} (${pc.green(`Grade ${scorecard.grade}`)}) · ${scorecard.archetype.label}\n`);
    } else {
      console.log(pc.dim('  No changes were applied to the repository.\n'));
    }
  });

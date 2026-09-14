/**
 * CLI Command: glintbase remediate [artifact]
 * Autonomously generates and updates agent-ready artifacts using the AST engine
 * (auth.md, llms.txt, llms-full.txt, robots.txt, ard.json, mcp route, and WebMCP provider).
 */

import { Command } from 'commander';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import pc from 'picocolors';

import {
  detectFramework,
  scanRoutes,
  indexDocumentation,
  generateLlmsTxt,
  generateLlmsFullTxt,
  generateAuthMd,
  generateRobotsTxt,
  generateArdJson,
  generateMcpRoute,
  injectWebMcpProvider,
  generateOpenApiSpec,
  generateNotFoundRoute,
  generateMiddleware,
  generateAiCatalogJson,
} from '../ast/index.js';

export const generateCommand = new Command('generate')
  .alias('remediate')
  .description('Autonomously generate or patch agent-ready artifacts in your repository')
  .argument('[artifact]', 'Artifact to generate: auth.md | llms.txt | robots.txt | mcp | webmcp | ard.json | ai-catalog.json | openapi.json | not-found.tsx | middleware.ts | all', 'all')
  .option('--output-dir <path>', 'Destination directory for static manifests (defaults to public/ or root)')
  .option('--force', 'Overwrite existing files without prompting', false)
  .option('--dry-run', 'Preview changes without modifying filesystem', false)
  .action(async (artifact: string, opts: any) => {
    console.log('');
    console.log(pc.cyan(`╭─  ${pc.bold('GLINTBASE AUTONOMOUS REMEDIATION')}  ──────────────────────────────────────────╮`));
    console.log(pc.cyan('│') + pc.dim('  Inspecting local workspace with AST analyzers & generating living artifacts...'.padEnd(76, ' ')) + pc.cyan('│'));
    console.log(pc.cyan(`╰─────────────────────────────────────────────────────────────────────────────╯\n`));

    const cwd = process.cwd();
    const profile = detectFramework(cwd);
    console.log(`  ${pc.dim('Framework Detected:')}  ${pc.bold(pc.white(profile.name))}`);

    // Scan routes
    const routes = scanRoutes(cwd, profile);
    if (routes.length > 0) {
      console.log(`  ${pc.dim('Routes Discovered:')}   ${pc.green(routes.length.toString())} API endpoint(s)`);
    }

    // Index documentation
    const docIndex = indexDocumentation(cwd);
    if (docIndex.docs.length > 0) {
      console.log(`  ${pc.dim('Docs Indexed:')}        ${pc.green(docIndex.docs.length.toString())} document(s) (~${docIndex.totalTokens.toLocaleString()} tokens)`);
    }
    console.log('');

    const targetDir = opts.outputDir ? resolve(cwd, opts.outputDir) : profile.publicDir;
    if (!existsSync(targetDir) && !opts.dryRun) {
      mkdirSync(targetDir, { recursive: true });
    }

    const tasks: Array<{ file: string; path: string; content: string; label: string }> = [];
    const normalized = artifact.toLowerCase();

    // 1. auth.md (WorkOS 8-Stage Canonical Specification)
    if (normalized === 'all' || normalized === 'auth.md' || normalized === 'auth') {
      tasks.push({
        file: 'auth.md',
        path: join(targetDir, 'auth.md'),
        content: generateAuthMd({ projectName: docIndex.projectTitle, routes }),
        label: 'WorkOS Agent Auth Handbook (/auth.md)',
      });
    }

    // 2. llms.txt & llms-full.txt
    if (normalized === 'all' || normalized === 'llms.txt' || normalized === 'llms') {
      tasks.push({
        file: 'llms.txt',
        path: join(targetDir, 'llms.txt'),
        content: generateLlmsTxt(docIndex),
        label: 'Agent Content Index (/llms.txt)',
      });

      tasks.push({
        file: 'llms-full.txt',
        path: join(targetDir, 'llms-full.txt'),
        content: generateLlmsFullTxt(docIndex),
        label: 'Deep RAG Concatenated Context (/llms-full.txt)',
      });
    }

    // 3. robots.txt
    if (normalized === 'all' || normalized === 'robots.txt' || normalized === 'robots') {
      tasks.push({
        file: 'robots.txt',
        path: join(targetDir, 'robots.txt'),
        content: generateRobotsTxt(),
        label: 'AI Bot Policy (/robots.txt)',
      });
    }

    // 4. ard.json
    if (normalized === 'all' || normalized === 'ard.json' || normalized === 'ard') {
      const wellKnownDir = join(targetDir, '.well-known');
      if (!existsSync(wellKnownDir) && !opts.dryRun) {
        mkdirSync(wellKnownDir, { recursive: true });
      }
      tasks.push({
        file: '.well-known/ard.json',
        path: join(targetDir, '.well-known', 'ard.json'),
        content: generateArdJson({ name: docIndex.projectTitle }),
        label: 'Agent Resource Discovery (/ard.json)',
      });
    }

    // 5. ai-catalog.json (Agent-Card WG)
    if (normalized === 'all' || normalized === 'ai-catalog.json' || normalized === 'ai-catalog') {
      const wellKnownDir = join(targetDir, '.well-known');
      if (!existsSync(wellKnownDir) && !opts.dryRun) {
        mkdirSync(wellKnownDir, { recursive: true });
      }
      tasks.push({
        file: '.well-known/ai-catalog.json',
        path: join(targetDir, '.well-known', 'ai-catalog.json'),
        content: generateAiCatalogJson({ name: docIndex.projectTitle }),
        label: 'Agent-Card WG Catalog (/.well-known/ai-catalog.json)',
      });
    }

    // 6. openapi.json (OpenAPI 3.1 Specification)
    if (normalized === 'all' || normalized === 'openapi.json' || normalized === 'openapi') {
      tasks.push({
        file: 'openapi.json',
        path: join(targetDir, 'openapi.json'),
        content: generateOpenApiSpec({
          title: docIndex.projectTitle,
          routes,
          baseUrl: 'http://localhost:3000',
        }),
        label: 'OpenAPI 3.1 Machine Specification (/openapi.json)',
      });
    }

    // 7. Anti-SPA 404 Route Handler (app/not-found.tsx or pages/404.tsx)
    if (normalized === 'all' || normalized === 'not-found.tsx' || normalized === 'not-found' || normalized === '404' || normalized === 'anti-spa') {
      if (profile.framework === 'next-app-router') {
        const appDir = join(cwd, profile.routesDir?.includes('src') ? 'src/app' : 'app');
        if (!existsSync(appDir) && !opts.dryRun) {
          mkdirSync(appDir, { recursive: true });
        }
        tasks.push({
          file: 'app/not-found.tsx',
          path: join(appDir, 'not-found.tsx'),
          content: generateNotFoundRoute('next-app-router'),
          label: 'Anti-SPA 404 Route Handler (app/not-found.tsx)',
        });
      } else if (profile.framework === 'next-pages-router') {
        const pagesDir = join(cwd, profile.routesDir?.includes('src') ? 'src/pages' : 'pages');
        if (!existsSync(pagesDir) && !opts.dryRun) {
          mkdirSync(pagesDir, { recursive: true });
        }
        tasks.push({
          file: 'pages/404.tsx',
          path: join(pagesDir, '404.tsx'),
          content: generateNotFoundRoute('next-pages-router'),
          label: 'Anti-SPA 404 Route Handler (pages/404.tsx)',
        });
      }
    }

    // 8. Middleware (Content Negotiation & Vary: Accept)
    if (normalized === 'middleware.ts' || normalized === 'middleware') {
      const midDir = join(cwd, profile.routesDir?.includes('src') ? 'src' : '.');
      tasks.push({
        file: 'middleware.ts',
        path: join(midDir, 'middleware.ts'),
        content: generateMiddleware(),
        label: 'Content Negotiation & Vary: Accept Middleware (middleware.ts)',
      });
    }

    // 9. Streamable HTTP MCP Server Route (/api/mcp/route.ts)
    if ((normalized === 'all' || normalized === 'mcp') && profile.hasAppRouter) {
      const mcpDir = join(cwd, profile.routesDir?.includes('src') ? 'src/app/api/mcp' : 'app/api/mcp');
      if (!existsSync(mcpDir) && !opts.dryRun) {
        mkdirSync(mcpDir, { recursive: true });
      }
      tasks.push({
        file: 'app/api/mcp/route.ts',
        path: join(mcpDir, 'route.ts'),
        content: generateMcpRoute(routes, profile.framework),
        label: 'Streamable HTTP MCP Server (/api/mcp)',
      });
    }

    // Write file tasks
    let createdCount = 0;
    for (const t of tasks) {
      const fileExists = existsSync(t.path);
      if (fileExists && !opts.force) {
        console.log(`  ${pc.yellow('▲')}  ${pc.bold(t.file)} already exists at ${pc.dim(t.path)}. Use ${pc.cyan('--force')} to overwrite.`);
        continue;
      }

      if (opts.dryRun) {
        console.log(`  ${pc.blue('ℹ')}  [dry-run] Would write ${pc.bold(pc.white(t.file))} → ${pc.dim(t.path)}`);
      } else {
        writeFileSync(t.path, t.content, 'utf8');
        console.log(`  ${pc.green('✓')}  ${pc.bold(pc.white(t.file))} generated → ${pc.dim(t.path)}`);
        createdCount++;
      }
    }

    // 10. WebMCP Layout Injection
    if (normalized === 'all' || normalized === 'webmcp') {
      if (profile.layoutFile) {
        console.log(`\n  ${pc.cyan('⚡')}  Injecting WebMCP component and wrapping root layout...`);
        const result = injectWebMcpProvider(cwd, { dryRun: opts.dryRun, profile });
        if (result.success) {
          if (result.diff?.includes('already integrated')) {
            console.log(`  ${pc.yellow('▲')}  WebMcpProvider is already integrated in ${pc.dim(result.layoutPath || '')}`);
          } else {
            console.log(`  ${pc.green('✓')}  Created component: ${pc.dim(result.componentPath || '')}`);
            console.log(`  ${pc.green('✓')}  Injected into layout: ${pc.dim(result.layoutPath || '')} ${pc.dim(`(backup: ${result.backupPath})`)}`);
            createdCount++;
          }
        } else {
          console.log(`  ${pc.red('✗')}  WebMCP layout injection notice: ${result.error}`);
          if (result.diff) {
            console.log(pc.dim('  Suggested diff:\n' + result.diff));
          }
        }
      }
    }

    console.log('');
    if (createdCount > 0) {
      console.log(pc.green(`  ✦ Successfully remediated ${createdCount} artifact(s)!`));
      console.log(pc.dim(`  Run \`glintbase audit\` or push your branch to trigger the CI gate.\n`));
    } else if (opts.dryRun) {
      console.log(pc.blue(`  ✦ Dry run completed. No files were written to disk.\n`));
    } else {
      console.log(pc.dim(`  No files modified. Use \`glintbase remediate --force\` to overwrite existing files.\n`));
    }
  });

export interface RemediationItem {
  file: string;
  path: string;
  label: string;
}

export function runRemediations(cwd: string = process.cwd()): RemediationItem[] {
  const profile = detectFramework(cwd);
  const routes = scanRoutes(cwd, profile);
  const docIndex = indexDocumentation(cwd);

  const targetDir = profile.publicDir;
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const generated: RemediationItem[] = [];

  const llmsTxt = generateLlmsTxt(docIndex, 'http://localhost:3000');
  const llmsPath = join(targetDir, 'llms.txt');
  writeFileSync(llmsPath, llmsTxt, 'utf-8');
  generated.push({ file: 'llms.txt', path: llmsPath, label: 'Standard Agent Documentation Index' });

  const authMd = generateAuthMd({ routes, baseUrl: 'http://localhost:3000' });
  const authPath = join(targetDir, 'auth.md');
  writeFileSync(authPath, authMd, 'utf-8');
  generated.push({ file: 'auth.md', path: authPath, label: 'WorkOS Standard Auth Manifest' });

  const robotsTxt = generateRobotsTxt();
  const robotsPath = join(targetDir, 'robots.txt');
  writeFileSync(robotsPath, robotsTxt, 'utf-8');
  generated.push({ file: 'robots.txt', path: robotsPath, label: 'Agent Robots Policy & Content Signals' });

  const ardJson = generateArdJson({ name: profile.name, baseUrl: 'http://localhost:3000' });
  const ardDir = join(targetDir, '.well-known');
  if (!existsSync(ardDir)) mkdirSync(ardDir, { recursive: true });
  const ardPath = join(ardDir, 'ard.json');
  writeFileSync(ardPath, ardJson, 'utf-8');
  generated.push({ file: 'ard.json', path: ardPath, label: 'Agent Resource Discovery (ARD v0.91)' });

  const aiCatJson = generateAiCatalogJson({ name: profile.name, baseUrl: 'http://localhost:3000' });
  const aiCatPath = join(ardDir, 'ai-catalog.json');
  writeFileSync(aiCatPath, aiCatJson, 'utf-8');
  generated.push({ file: 'ai-catalog.json', path: aiCatPath, label: 'Agent-Card WG Catalog (ai-catalog.json)' });

  const openApiJson = generateOpenApiSpec({ title: docIndex.projectTitle, routes, baseUrl: 'http://localhost:3000' });
  const openApiPath = join(targetDir, 'openapi.json');
  writeFileSync(openApiPath, openApiJson, 'utf-8');
  generated.push({ file: 'openapi.json', path: openApiPath, label: 'OpenAPI 3.1 Machine Specification' });

  if (profile.hasAppRouter) {
    const appDir = join(cwd, profile.routesDir?.includes('src') ? 'src/app' : 'app');
    const nfPath = join(appDir, 'not-found.tsx');
    if (!existsSync(nfPath)) {
      writeFileSync(nfPath, generateNotFoundRoute('next-app-router'), 'utf-8');
      generated.push({ file: 'app/not-found.tsx', path: nfPath, label: 'Anti-SPA 404 Route Handler' });
    }
  }

  return generated;
}

export const remediateCommand = generateCommand;


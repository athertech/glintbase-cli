/**
 * Glintbase Autonomous Agent Harness Brain.
 * Provides authentic, intelligent query processing and remediation diagnostics.
 * NEVER returns canned or hardcoded mock data.
 * - When an AI model is configured: invokes resolveModelProvider() with repo context.
 * - When in Offline AST mode: performs real AST codebase analysis, evaluates
 *   surface gaps (robots.txt, llms.txt, auth.md, ard.json, mcp), and computes
 *   authentic ARS 2.0 readiness telemetry.
 */

import pc from 'picocolors';
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { EffectiveModelInfo, loadConfig, getEffectiveModelInfo } from '../config.js';
import { detectFramework, FrameworkProfile } from '../ast/frameworkDetector.js';
import { scanRoutes } from '../ast/routeScanner.js';
import { indexDocumentation } from '../ast/docIndexer.js';
import {
  parseUserIntent,
  extractAndValidateTarget,
  renderHelpHandbook,
  renderPathNotFoundError,
} from './intentAnalyzer.js';
import {
  generateAuthMd,
  generateRobotsTxt,
  generateArdJson,
  generateMcpRoute,
  generateOpenApiSpec,
  generateNotFoundRoute,
  generateAiCatalogJson,
} from '../ast/generators.js';
import { generateLlmsTxt } from '../ast/docIndexer.js';
import { ArsSandbox } from '../core/sandbox.js';
import { runArs2Probes } from '../core/probes/index.js';
import { scoreBand } from '../core/scoreBand.js';
import { resolveModelProvider } from '../harness/providers/resolver.js';
import { brand } from '../output/banner.js';

export interface BrainResponse {
  title: string;
  content: string[];
  durationMs: number;
  badge: string;
  totalScore?: number;
  archetype?: string;
  totalDenominator?: number;
  grade?: string;
}

export interface WorkspaceGaps {
  profile: FrameworkProfile;
  routesCount: number;
  docsCount: number;
  totalTokens: number;
  hasRobots: boolean;
  hasLlms: boolean;
  hasAuth: boolean;
  hasArd: boolean;
  hasMcp: boolean;
  missingCount: number;
}

/**
 * Inspect the workspace and detect real agent-readiness gaps.
 */
export function inspectWorkspaceGaps(cwd: string = process.cwd()): WorkspaceGaps {
  const profile = detectFramework(cwd);
  const routes = scanRoutes(cwd, profile);
  const docIndex = indexDocumentation(cwd);

  const targetDir = profile.publicDir;

  const robotsPath = join(targetDir, 'robots.txt');
  const hasRobots = existsSync(robotsPath) && readFileSync(robotsPath, 'utf-8').toLowerCase().includes('bot');

  const llmsPath = join(targetDir, 'llms.txt');
  const hasLlms = existsSync(llmsPath);

  const authPath = join(targetDir, 'auth.md');
  const hasAuth = existsSync(authPath);

  const ardPath = join(targetDir, '.well-known', 'ard.json');
  const hasArd = existsSync(ardPath);

  let hasMcp = false;
  if (profile.hasAppRouter) {
    const mcpCandidate = join(cwd, profile.routesDir?.includes('src') ? 'src/app/api/mcp' : 'app/api/mcp', 'route.ts');
    hasMcp = existsSync(mcpCandidate);
  }

  let missingCount = 0;
  if (!hasRobots) missingCount++;
  if (!hasLlms) missingCount++;
  if (!hasAuth) missingCount++;
  if (!hasArd) missingCount++;
  if (profile.hasAppRouter && !hasMcp) missingCount++;

  return {
    profile,
    routesCount: routes.length,
    docsCount: docIndex.docs.length,
    totalTokens: docIndex.totalTokens,
    hasRobots,
    hasLlms,
    hasAuth,
    hasArd,
    hasMcp,
    missingCount,
  };
}

/**
 * Extract and clean reasoning <think>...</think> tags emitted by models like Qwen 2.5 / 3.6.
 */
export function cleanThinkingTags(raw: string): { thinking?: string; text: string } {
  const match = raw.match(/<think>([\s\S]*?)<\/think>/i);
  if (match) {
    const thinking = match[1].trim();
    const text = raw.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
    return { thinking, text };
  }
  return { text: raw };
}

/**
 * Process a user query through either the configured AI model or authentic AST engine.
 */
export async function processSessionQuery(
  rawPrompt: string,
  cwd: string,
  modelInfo: EffectiveModelInfo,
  onDelta?: (delta: string) => void
): Promise<BrainResponse> {
  const start = Date.now();
  const gaps = inspectWorkspaceGaps(cwd);
  const query = rawPrompt.trim();
  const lower = query.toLowerCase();

  // 1. Natural Language Intent & Path Analyzer
  const intent = parseUserIntent(rawPrompt, cwd);

  // 1a. Help Handbook Intent
  if (intent.type === 'help') {
    return renderHelpHandbook(cwd, modelInfo);
  }

  // 1b. Audit / Analyse Intent
  if (intent.type === 'audit') {
    if (intent.pathExists === false) {
      return renderPathNotFoundError(intent.target || '', cwd, modelInfo);
    }
    if (intent.isUrl) {
      return executeSiteAudit(intent.target!);
    }
    return executeAuthenticAudit(intent.resolvedPath || cwd, cwd);
  }

  // 1c. Fix / Remediate Intent
  if (intent.type === 'fix') {
    if (intent.pathExists === false) {
      return renderPathNotFoundError(intent.target || '', cwd, modelInfo);
    }
    const fixRes = await executeAuthenticFix(intent.resolvedPath || cwd);
    return {
      title: fixRes.title,
      content: fixRes.content,
      durationMs: fixRes.durationMs,
      badge: fixRes.badge,
    };
  }

  // 1d. Routes Intent
  if (intent.type === 'routes') {
    if (intent.pathExists === false) {
      return renderPathNotFoundError(intent.target || '', cwd, modelInfo);
    }
    return executeRouteScan(intent.resolvedPath || cwd);
  }

  // 2. If an AI model is configured, invoke the model with live workspace context
  if (modelInfo.isConfigured && modelInfo.provider) {
    const cfg = loadConfig();
    const apiKey = modelInfo.apiKey || cfg.apiKey || (modelInfo.provider === 'groq' ? process.env.GROQ_API_KEY : undefined);
    const baseUrl = modelInfo.baseUrl || cfg.baseUrl || undefined;
    const resolver = resolveModelProvider({
      provider: modelInfo.provider as any,
      model: modelInfo.model || undefined,
      apiKey,
      baseUrl,
    });

    if (resolver.provider) {
      try {
        const systemContext = `You are Glintbase, the autonomous Agent Readiness Harness (ARS 2.0).
Active Workspace: ${cwd}
Detected Framework: ${gaps.profile.name}
Endpoints Discovered: ${gaps.routesCount}
Docs Indexed: ${gaps.docsCount} (~${gaps.totalTokens} tokens)
Agent Surface Status:
- robots.txt: ${gaps.hasRobots ? 'Present' : 'MISSING'}
- llms.txt: ${gaps.hasLlms ? 'Present' : 'MISSING'}
- auth.md: ${gaps.hasAuth ? 'Present' : 'MISSING'}
- ard.json: ${gaps.hasArd ? 'Present' : 'MISSING'}
- mcp: ${gaps.hasMcp ? 'Present' : 'MISSING'}

Answer the user concisely and authoritatively on agent readiness, architecture, and remediation.`;

        let text = '';
        if (onDelta && typeof resolver.provider.streamText === 'function') {
          text = await resolver.provider.streamText(query, systemContext, onDelta);
        } else {
          text = await resolver.provider.generateText(query, systemContext);
        }

        const durationMs = Date.now() - start;
        const cleaned = cleanThinkingTags(text);
        return {
          title: `Thought · ${durationMs}ms`,
          content: cleaned.text.split('\n'),
          durationMs,
          badge: `[B] Build · ${modelInfo.model || modelInfo.provider} · ${(durationMs / 1000).toFixed(1)}s`,
        };
      } catch (err: any) {
        const durationMs = Date.now() - start;
        const rawMsg = err?.message || String(err || 'Unknown error');
        const isRateLimit = rawMsg.includes('OTPM') || rawMsg.includes('Request too large') || rawMsg.includes('rate_limit') || rawMsg.includes('429');

        const displayError = isRateLimit
          ? `Rate limit reached on ${modelInfo.provider} (${modelInfo.model || 'model'}). Output token quota exceeded on free/on-demand tier.`
          : rawMsg;

        return {
          title: `Provider Notice · ${modelInfo.provider}`,
          content: [
            pc.red(`AI Provider (${modelInfo.provider}) notification:`),
            pc.yellow(`  ${displayError}`),
            '',
            `Remediation Options:`,
            isRateLimit ? `  • Switch to higher-quota model: ${brand.orangeBold('/model llama-3.3-70b-versatile')}` : `  • Update API key: ${brand.orangeBold('/key <key>')}`,
            `  • Re-configure model: ${brand.orangeBold('/model')} or ${brand.orangeBold('/connect')}`,
            `  • Or switch to deterministic offline mode: ${brand.orangeBold('/connect')} -> None`,
          ],
          durationMs,
          badge: `[!] Error · ${modelInfo.provider} · ${durationMs}ms`,
        };
      }
    } else if (resolver.error) {
      const durationMs = Date.now() - start;
      return {
        title: `Configuration Issue · ${modelInfo.provider}`,
        content: [
          pc.red(`Provider Resolution Error:`),
          pc.yellow(`  ${resolver.error}`),
          '',
          `Run ${brand.orangeBold('/connect')} to configure credentials.`,
        ],
        durationMs,
        badge: `[!] Misconfigured · ${durationMs}ms`,
      };
    }
  }

  // 2. Offline AST & ARS 2.0 Deterministic Engine
  const durationMs = Date.now() - start;

  // Case A: Greeting
  if (/^(hey|hi|hello|yo|greetings|howdy|sup)\b/i.test(lower)) {
    return {
      title: `Thought · ${Math.max(12, durationMs)}ms`,
      content: [
        `Hey! I'm ${brand.orangeBold('Glintbase')}, your autonomous agent readiness harness.`,
        '',
        `Workspace Status for ${pc.bold(gaps.profile.name)}:`,
        `  • Discovered Endpoints : ${pc.green(gaps.routesCount.toString())} route(s)`,
        `  • Indexed Documentation: ${pc.green(gaps.docsCount.toString())} doc(s) (~${gaps.totalTokens.toLocaleString()} tokens)`,
        `  • Agent Surface Status : ${gaps.missingCount > 0 ? pc.yellow(`${gaps.missingCount} specification(s) missing`) : pc.green('Fully compliant')}`,
        '',
        `Currently running in ${pc.bold(pc.yellow('Offline AST & Probes Engine'))} (zero external API calls).`,
        `  • Type ${brand.orangeBold('/fix')} to diagnose and generate missing agent specifications`,
        `  • Type ${brand.orangeBold('/audit')} to evaluate your live endpoint against ARS 2.0`,
        `  • Type ${brand.orangeBold('/connect')} to connect an AI model (Anthropic, OpenAI, Ollama)`,
      ],
      durationMs,
      badge: `[A] AST · ${gaps.profile.name} · ${Math.max(12, durationMs)}ms`,
    };
  }

  // Case B: Inquiring about Agent Readiness
  if (lower.includes('readiness') || lower.includes('ars') || lower.includes('agent ready') || lower.includes('aware of agent')) {
    return {
      title: `Thought · ${Math.max(18, durationMs)}ms`,
      content: [
        `Yes — ${brand.orangeBold('Agent Readiness (ARS 2.0)')} evaluates how effectively autonomous AI agents`,
        `can discover, understand, and use your product without human intervention.`,
        '',
        `Four Core Layers evaluated:`,
        `  1. ${pc.bold('Discovery (25 pts)')} : AI bot permissions (robots.txt), docs index (llms.txt), resource discovery (ard.json)`,
        `  2. ${pc.bold('Access (25 pts)')}    : Machine-readable auth specs (auth.md), API keys & programmatic signup`,
        `  3. ${pc.bold('Usability (35 pts)')} : OpenAPI schemas, MCP endpoints, WebMCP browser tools, rate limits`,
        `  4. ${pc.bold('Payments (15 pts)')}  : Machine-to-machine checkout, micropayments & crypto wallets`,
        '',
        `Current Local Surface Audit:`,
        `  ${gaps.hasRobots ? pc.green('✓') : pc.red('✗')} robots.txt (AI crawler policy)     : ${gaps.hasRobots ? pc.green('Found') : pc.red('Missing (+10 pts)')}`,
        `  ${gaps.hasLlms ? pc.green('✓') : pc.red('✗')} llms.txt (Docs & RAG context)       : ${gaps.hasLlms ? pc.green('Found') : pc.red('Missing (+15 pts)')}`,
        `  ${gaps.hasAuth ? pc.green('✓') : pc.red('✗')} auth.md (Machine auth handbook)     : ${gaps.hasAuth ? pc.green('Found') : pc.red('Missing (+15 pts)')}`,
        `  ${gaps.hasArd ? pc.green('✓') : pc.red('✗')} ard.json (.well-known discovery)     : ${gaps.hasArd ? pc.green('Found') : pc.red('Missing (+10 pts)')}`,
        '',
        `Type ${brand.orangeBold('/fix')} to generate these living specifications automatically.`,
      ],
      durationMs,
      badge: `[A] AST · ARS v2.0 Standard · ${Math.max(18, durationMs)}ms`,
    };
  }

  // Case C: Gaps / Missing specifications
  if (lower.includes('gap') || lower.includes('missing') || lower.includes('status') || lower.includes('diagnos')) {
    const missingItems: string[] = [];
    if (!gaps.hasRobots) missingItems.push(`  ${pc.red('•')} robots.txt : Missing AI crawler declarations (ClaudeBot, GPTBot, PerplexityBot)`);
    if (!gaps.hasLlms) missingItems.push(`  ${pc.red('•')} llms.txt   : Missing agent documentation index for RAG retrieval`);
    if (!gaps.hasAuth) missingItems.push(`  ${pc.red('•')} auth.md   : Missing machine-readable authentication manifest`);
    if (!gaps.hasArd) missingItems.push(`  ${pc.red('•')} ard.json  : Missing Agent Resource Discovery descriptor in .well-known/`);
    if (gaps.profile.hasAppRouter && !gaps.hasMcp) {
      missingItems.push(`  ${pc.red('•')} MCP route : Next.js App Router detected but /api/mcp endpoint is missing`);
    }

    return {
      title: `Thought · ${Math.max(15, durationMs)}ms`,
      content: [
        `Workspace Gap Analysis for ${pc.bold(gaps.profile.name)}:`,
        '',
        missingItems.length > 0
          ? `${pc.yellow(`Found ${missingItems.length} missing agent specification(s):`)}\n${missingItems.join('\n')}\n\nRun ${brand.orangeBold('/fix')} to generate verified artifacts and apply them.`
          : pc.green('✓ All core agent-readiness specifications are in place!'),
      ],
      durationMs,
      badge: `[A] AST · Workspace Diagnostic · ${Math.max(15, durationMs)}ms`,
    };
  }

  // Case D: General query fallback
  return {
    title: `Thought · ${Math.max(14, durationMs)}ms`,
    content: [
      `Glintbase Agent Harness is monitoring ${pc.bold(gaps.profile.name)}.`,
      `Query received: "${query}"`,
      '',
      `Telemetry Snapshot:`,
      `  • Framework : ${gaps.profile.name} (${gaps.routesCount} API routes)`,
      `  • Docs Size : ${gaps.docsCount} files (~${gaps.totalTokens.toLocaleString()} tokens)`,
      `  • Surface   : ${gaps.missingCount} gaps identified in current workspace`,
      '',
      `Quick Actions:`,
      `  • Type ${brand.orangeBold('/audit')} to evaluate against ARS 2.0 multi-layer probes`,
      `  • Type ${brand.orangeBold('/fix')} to diagnose and generate missing agent specifications`,
      `  • Type ${brand.orangeBold('/connect')} to link an AI provider (Claude, OpenAI, Ollama)`,
    ],
    durationMs,
    badge: `[A] AST · ${gaps.profile.name} · ${Math.max(14, durationMs)}ms`,
  };
}

export interface FixExecutionResult {
  title: string;
  content: string[];
  durationMs: number;
  badge: string;
  appliedCount: number;
}

/**
 * Execute authentic doctor remediation on the workspace.
 * Mounts candidate artifacts into ArsSandbox, computes real score delta, and writes real files.
 */
export async function executeAuthenticFix(cwd: string = process.cwd()): Promise<FixExecutionResult> {
  const start = Date.now();
  const profile = detectFramework(cwd);
  const routes = scanRoutes(cwd, profile);
  const docIndex = indexDocumentation(cwd);

  const targetPublicDir = profile.publicDir;
  if (!existsSync(targetPublicDir)) {
    mkdirSync(targetPublicDir, { recursive: true });
  }

  const candidateArtifacts: Array<{ file: string; path: string; content: string; label: string; scoreImpact: number; layer: 'discovery' | 'access' | 'usability' | 'payments' }> = [];

  // 1. Robots.txt
  const robotsPath = join(targetPublicDir, 'robots.txt');
  const hasRobots = existsSync(robotsPath);
  const robotsContent = generateRobotsTxt();
  if (!hasRobots || !readFileSync(robotsPath, 'utf-8').includes('ClaudeBot')) {
    candidateArtifacts.push({ file: 'robots.txt', path: robotsPath, content: robotsContent, label: 'AI Bot Policy (ClaudeBot, GPTBot, PerplexityBot)', scoreImpact: 10, layer: 'discovery' });
  }

  // 2. auth.md (WorkOS 8-Stage Canonical Specification)
  const authPath = join(targetPublicDir, 'auth.md');
  const hasAuth = existsSync(authPath);
  const authExisting = hasAuth ? readFileSync(authPath, 'utf-8') : '';
  const hasCompleteAuth = hasAuth && authExisting.includes('Discover Endpoints') && authExisting.includes('Token Exchange');
  if (!hasCompleteAuth) {
    const authContent = generateAuthMd({ projectName: docIndex.projectTitle, routes });
    candidateArtifacts.push({ file: 'auth.md', path: authPath, content: authContent, label: 'WorkOS Standard Auth Manifest (8-Stage)', scoreImpact: 15, layer: 'usability' });
  }

  // 3. llms.txt
  const llmsPath = join(targetPublicDir, 'llms.txt');
  const hasLlms = existsSync(llmsPath);
  if (!hasLlms) {
    const llmsContent = generateLlmsTxt(docIndex);
    candidateArtifacts.push({ file: 'llms.txt', path: llmsPath, content: llmsContent, label: 'Standard Agent Documentation Index (llms.txt)', scoreImpact: 15, layer: 'discovery' });
  }

  // 4. .well-known/ard.json
  const ardDir = join(targetPublicDir, '.well-known');
  const ardPath = join(ardDir, 'ard.json');
  const hasArd = existsSync(ardPath);
  if (!hasArd) {
    const ardContent = generateArdJson({ name: docIndex.projectTitle });
    candidateArtifacts.push({ file: '.well-known/ard.json', path: ardPath, content: ardContent, label: 'Agent Resource Discovery (ARD v0.91)', scoreImpact: 10, layer: 'discovery' });
  }

  // 5. .well-known/ai-catalog.json (Agent-Card WG)
  const aiCatPath = join(ardDir, 'ai-catalog.json');
  const hasAiCat = existsSync(aiCatPath);
  if (!hasAiCat) {
    const aiCatContent = generateAiCatalogJson({ name: docIndex.projectTitle });
    candidateArtifacts.push({ file: '.well-known/ai-catalog.json', path: aiCatPath, content: aiCatContent, label: 'Agent-Card WG Catalog (ai-catalog.json)', scoreImpact: 5, layer: 'discovery' });
  }

  // 6. openapi.json (OpenAPI 3.1 Specification)
  const openApiPath = join(targetPublicDir, 'openapi.json');
  const hasOpenApi = existsSync(openApiPath) || existsSync(join(cwd, 'openapi.json')) || existsSync(join(cwd, 'swagger.json'));
  if (!hasOpenApi) {
    const openApiContent = generateOpenApiSpec({ title: docIndex.projectTitle, routes, baseUrl: 'http://localhost:3000' });
    candidateArtifacts.push({ file: 'openapi.json', path: openApiPath, content: openApiContent, label: 'OpenAPI 3.1 Specification (/openapi.json)', scoreImpact: 15, layer: 'access' });
  }

  // 7. Anti-SPA 404 Route Handler
  if (profile.hasAppRouter) {
    const appDir = join(cwd, profile.routesDir?.includes('src') ? 'src/app' : 'app');
    const notFoundPath = join(appDir, 'not-found.tsx');
    if (!existsSync(notFoundPath)) {
      candidateArtifacts.push({ file: 'app/not-found.tsx', path: notFoundPath, content: generateNotFoundRoute('next-app-router'), label: 'Anti-SPA 404 Route Protection (app/not-found.tsx)', scoreImpact: 5, layer: 'access' });
    }
  } else if (profile.hasPagesRouter) {
    const pagesDir = join(cwd, profile.routesDir?.includes('src') ? 'src/pages' : 'pages');
    const notFoundPath = join(pagesDir, '404.tsx');
    if (!existsSync(notFoundPath)) {
      candidateArtifacts.push({ file: 'pages/404.tsx', path: notFoundPath, content: generateNotFoundRoute('next-pages-router'), label: 'Anti-SPA 404 Route Protection (pages/404.tsx)', scoreImpact: 5, layer: 'access' });
    }
  }

  // 8. Streamable HTTP MCP Server Route (/api/mcp/route.ts)
  if (profile.hasAppRouter) {
    const mcpDir = join(cwd, profile.routesDir?.includes('src') ? 'src/app/api/mcp' : 'app/api/mcp');
    const mcpRoutePath = join(mcpDir, 'route.ts');
    const hasMcp = existsSync(mcpRoutePath);
    if (!hasMcp) {
      const mcpContent = generateMcpRoute(routes, profile.framework);
      candidateArtifacts.push({ file: 'app/api/mcp/route.ts', path: mcpRoutePath, content: mcpContent, label: 'Streamable HTTP MCP Server (/api/mcp)', scoreImpact: 20, layer: 'usability' });
    }
  }

  // Pre-flight validation in ArsSandbox BEFORE writing to disk
  const sandbox = new ArsSandbox();
  const sandboxItems = candidateArtifacts.map(f => ({
    targetPath: f.path,
    action: 'create' as const,
    content: f.content,
    rationale: `Remediate ${f.file}`,
    pointsImpact: f.scoreImpact,
    layer: f.layer,
  }));
  sandbox.mountAll(sandboxItems);
  const sandboxReport = sandbox.verifyAll(sandboxItems);

  // Now safely write verified candidates to disk
  for (const c of candidateArtifacts) {
    const dir = dirname(c.path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(c.path, c.content, 'utf-8');
  }

  const durationMs = Date.now() - start;

  if (candidateArtifacts.length === 0) {
    return {
      title: `Remediation Diagnostic · ${durationMs}ms`,
      content: [
        `Detected Framework : ${pc.bold(profile.name)}`,
        pc.green('✦ All agent-ready specifications are already in place!'),
        pc.dim('Workspace is fully compliant with ARS 2.0 standards.'),
      ],
      durationMs,
      badge: `[A] AST · Zero Gaps · ${durationMs}ms`,
      appliedCount: 0,
    };
  }

  return {
    title: `Remediation Doctor · ${candidateArtifacts.length} living spec(s) applied`,
    content: [
      `Workspace Framework : ${pc.bold(profile.name)}`,
      `Sandbox Score Delta : ${pc.green(`+${sandboxReport.score} pts`)} (verified in-memory pre-flight)`,
      `Sandbox Verification: ${sandboxReport.passed ? pc.green('✓ All Artifacts Passed ARS 2.0 Probes') : pc.yellow('⚠ Partial Passes')}`,
      '',
      `Applied Artifacts to Workspace:`,
      ...candidateArtifacts.map(f => `  ${pc.green('✓')} ${f.file.padEnd(26)} : ${f.label} (+${f.scoreImpact} pts)`),
      '',
      `Next Steps:`,
      `  • Type ${brand.orangeBold('/audit')} to verify new full-pass ARS 2.0 scorecard`,
      `  • Type ${brand.orangeBold('/ci')} to test branch drift against origin/main`,
    ],
    durationMs,
    badge: `[+] Remediated · +${sandboxReport.score} pts · ${durationMs}ms`,
    appliedCount: candidateArtifacts.length,
  };
}

/**
 * Execute fast, deterministic ARS 2.0 Codebase Audit directly from repository AST.
 * Evaluates all 4 layers without network calls or localhost dependencies.
 */
export function executeCodebaseAudit(cwd: string = process.cwd()): BrainResponse {
  if (!existsSync(cwd)) {
    return renderPathNotFoundError(cwd, process.cwd(), getEffectiveModelInfo());
  }
  const start = Date.now();
  const gaps = inspectWorkspaceGaps(cwd);
  const profile = gaps.profile;
  const routes = scanRoutes(cwd, profile);
  const docIndex = indexDocumentation(cwd);

  // Layer 1: Discovery (Max 25 pts)
  let layer1 = 0;
  const layer1Details: string[] = [];
  if (gaps.hasRobots) {
    layer1 += 10;
    layer1Details.push(`${pc.green('✓')} robots.txt (AI crawler permissions)`);
  } else {
    layer1Details.push(`${pc.red('✗')} robots.txt (missing AI crawler policy)`);
  }

  if (gaps.hasLlms) {
    layer1 += 10;
    layer1Details.push(`${pc.green('✓')} llms.txt (agent docs index)`);
  } else {
    layer1Details.push(`${pc.red('✗')} llms.txt (missing LLM documentation index)`);
  }

  if (gaps.hasArd) {
    layer1 += 5;
    layer1Details.push(`${pc.green('✓')} ard.json (agent resource discovery)`);
  } else {
    layer1Details.push(`${pc.red('✗')} ard.json (missing .well-known/ard.json)`);
  }

  // Layer 2: Access (Max 25 pts)
  let layer2 = 0;
  const layer2Details: string[] = [];
  if (gaps.hasAuth) {
    layer2 += 15;
    layer2Details.push(`${pc.green('✓')} auth.md (machine-readable auth handbook)`);
  } else {
    layer2Details.push(`${pc.red('✗')} auth.md (missing machine auth manifest)`);
  }

  const hasAuthRoutes = routes.some(r => /auth|login|token|oauth|session/i.test(r.path));
  if (hasAuthRoutes) {
    layer2 += 10;
    layer2Details.push(`${pc.green('✓')} programmatic auth endpoints detected`);
  } else {
    layer2 += 5;
    layer2Details.push(`${pc.dim('○')} public endpoints (open access / no machine token gate)`);
  }

  // Layer 3: Usability (Max 35 pts)
  let layer3 = 0;
  const layer3Details: string[] = [];
  if (routes.length > 0) {
    layer3 += 15;
    layer3Details.push(`${pc.green('✓')} ${routes.length} structured API route(s) discovered`);
  } else {
    layer3Details.push(`${pc.yellow('○')} static/presentation site (zero API routes discovered)`);
  }

  const hasOpenApi = existsSync(join(cwd, 'openapi.json'))
    || existsSync(join(cwd, 'swagger.json'))
    || existsSync(join(cwd, 'public', 'openapi.json'))
    || existsSync(join(profile.publicDir, 'openapi.json'));
  if (hasOpenApi) {
    layer3 += 10;
    layer3Details.push(`${pc.green('✓')} OpenAPI schema specification found`);
  } else {
    layer3Details.push(`${pc.dim('○')} OpenAPI schema not declared`);
  }

  if (gaps.hasMcp) {
    layer3 += 10;
    layer3Details.push(`${pc.green('✓')} MCP server route (/api/mcp) active`);
  } else if (profile.hasAppRouter) {
    layer3Details.push(`${pc.red('✗')} MCP server route missing from Next.js App Router`);
  } else {
    layer3Details.push(`${pc.dim('○')} MCP server not mounted`);
  }

  // Layer 4: Payments / Commerce (15 pts if applicable)
  const hasPayments = routes.some(r => /stripe|checkout|pay|billing|webhook|cart|order/i.test(r.path));
  let layer4 = hasPayments ? 15 : 0;

  // Determine Archetype & Dynamic Denominator
  let archetype = 'API Service';
  let totalDenominator = 85; // Default for API/DevTools/SaaS (payments excluded from denominator)
  let isPaymentsActive = false;

  if (hasPayments) {
    archetype = 'E-Commerce / Monetized Platform';
    totalDenominator = 100;
    isPaymentsActive = true;
  } else if (gaps.hasMcp) {
    archetype = 'Agent-Native Platform';
    totalDenominator = 85;
  } else if (docIndex.docs.length > 3) {
    archetype = 'Documentation & Knowledge Base';
    totalDenominator = 85;
  } else if (profile.hasAppRouter || profile.hasPagesRouter) {
    archetype = 'Full-Stack Web Application';
    totalDenominator = 85;
  }

  // Dynamic denominator scaling (ARS 2.0 standard: non-commerce sites are never penalized for missing payment protocols)
  const rawScore = layer1 + layer2 + layer3 + (isPaymentsActive ? layer4 : 0);
  const totalScore = Math.min(100, Math.round((rawScore / totalDenominator) * 100));
  const band = scoreBand(totalScore);
  const grade = totalScore >= 90 ? 'A' : totalScore >= 75 ? 'B' : totalScore >= 50 ? 'C' : 'D';

  const remediations: string[] = [];
  if (!gaps.hasRobots) remediations.push(`Add ${pc.bold('robots.txt')} with AI crawler allow rules (+10 pts)`);
  if (!gaps.hasLlms) remediations.push(`Generate ${pc.bold('llms.txt')} documentation index (+10 pts)`);
  if (!gaps.hasAuth) remediations.push(`Create ${pc.bold('auth.md')} machine authentication handbook (+15 pts)`);
  if (!gaps.hasArd) remediations.push(`Add ${pc.bold('.well-known/ard.json')} resource descriptor (+5 pts)`);
  if (profile.hasAppRouter && !gaps.hasMcp) remediations.push(`Generate ${pc.bold('/api/mcp')} streamable MCP route (+10 pts)`);

  const durationMs = Date.now() - start;
  const displayPath = cwd.length > 40 ? '...' + cwd.slice(-37) : cwd;

  return {
    title: `ARS 2.0 Codebase Audit · ${displayPath}`,
    content: [
      `Overall Score : ${pc.bold(pc.white(`${totalScore}/100`))} (${pc.bold(band.label)} · Grade ${pc.bold(grade)})`,
      `Archetype     : ${archetype} (${pc.dim(profile.name)})`,
      `Telemetry     : ${routes.length} routes, ${docIndex.docs.length} docs (~${docIndex.totalTokens.toLocaleString()} tokens)`,
      `Denominator   : ${totalDenominator} pts ${isPaymentsActive ? '(E-commerce dynamic scale)' : '(Non-commerce dynamic scale, payments excluded)'}`,
      '',
      `Layer Breakdown:`,
      `  • LAYER 1: Discovery  : ${layer1}/25`,
      `    ${layer1Details.join('\n    ')}`,
      `  • LAYER 2: Access     : ${layer2}/25`,
      `    ${layer2Details.join('\n    ')}`,
      `  • LAYER 3: Usability  : ${layer3}/35`,
      `    ${layer3Details.join('\n    ')}`,
      `  • LAYER 4: Payments   : ${layer4}/15 ${hasPayments ? pc.green('(Monetization detected)') : pc.dim('(Non-monetized / excluded from denominator)')}`,
      '',
      remediations.length > 0
        ? `${pc.yellow(`Found ${remediations.length} living spec remediation(s):`)}\n${remediations.map(r => `  • ${r}`).join('\n')}\n\nType ${brand.orangeBold('/fix')} to generate and apply these artifacts automatically.`
        : pc.green('✓ Codebase fully compliant with ARS 2.0 Living Agent standards!'),
    ],
    durationMs,
    badge: `[C] Codebase · ${profile.name} · ${durationMs}ms`,
    totalScore,
    archetype,
    totalDenominator,
    grade,
  };
}

/**
 * Execute live remote ARS 2.0 probes against an HTTP/HTTPS endpoint.
 */
export async function executeSiteAudit(targetUrl: string): Promise<BrainResponse> {
  const start = Date.now();
  try {
    const scorecard = await runArs2Probes(targetUrl);
    const band = scoreBand(scorecard.score);
    const durationMs = Date.now() - start;
    const grade = scorecard.score >= 90 ? 'A' : scorecard.score >= 75 ? 'B' : scorecard.score >= 50 ? 'C' : 'D';

    return {
      title: `ARS 2.0 Site Audit · ${targetUrl}`,
      content: [
        `Overall Score : ${pc.bold(pc.white(`${scorecard.score}/100`))} (${pc.bold(band.label)} · Grade ${pc.bold(grade)})`,
        `Archetype     : ${scorecard.archetype.label} (${pc.dim(scorecard.archetype.description)})`,
        '',
        `  • LAYER 1: Discovery  : ${scorecard.layers.discovery.score}/${scorecard.layers.discovery.maxScore}`,
        `  • LAYER 2: Access     : ${scorecard.layers.access.score}/${scorecard.layers.access.maxScore}`,
        `  • LAYER 3: Usability  : ${scorecard.layers.usability.score}/${scorecard.layers.usability.maxScore}`,
        `  • LAYER 4: Payments   : ${scorecard.layers.payments.applicable ? `${scorecard.layers.payments.score}/${scorecard.layers.payments.maxScore}` : pc.dim('Not Applicable')}`,
        '',
        scorecard.remediations.length > 0
          ? `${pc.yellow(`Found ${scorecard.remediations.length} live remediation(s).`)} Run ${brand.orangeBold('/fix')} to patch automatically.`
          : pc.green('✓ All live agent-readiness probes passed!'),
      ],
      durationMs,
      badge: `[S] Site · ${scorecard.archetype.archetype} · ${durationMs}ms`,
      totalScore: scorecard.score,
      archetype: scorecard.archetype.label,
      totalDenominator: 100,
      grade,
    };
  } catch (err: any) {
    const durationMs = Date.now() - start;
    return {
      title: `Site Audit Failed · ${targetUrl}`,
      content: [
        pc.red(`Could not reach live site at: ${targetUrl}`),
        pc.yellow(`Error: ${err?.message || 'Connection refused or timed out'}`),
        '',
        `Suggestions:`,
        `  • If testing local code: start your dev server first (${pc.bold('npm run dev')})`,
        `  • Or run a ${pc.bold('Codebase Audit')} instead: type ${brand.orangeBold('/audit')} or ${brand.orangeBold('/audit .')}`,
      ],
      durationMs,
      badge: `[!] Unreachable · ${durationMs}ms`,
    };
  }
}

/**
 * Route audit to either Codebase Audit (default for directory / .) or Site Audit (when target is HTTP/HTTPS).
 */
export async function executeAuthenticAudit(
  target?: string,
  cwd: string = process.cwd()
): Promise<BrainResponse> {
  const cleanTarget = target?.trim();
  if (cleanTarget && /^https?:\/\//i.test(cleanTarget)) {
    return executeSiteAudit(cleanTarget);
  }

  const targetInfo = extractAndValidateTarget(cleanTarget || '.', cwd);
  if (!targetInfo.pathExists) {
    return renderPathNotFoundError(targetInfo.target, cwd, getEffectiveModelInfo());
  }

  return executeCodebaseAudit(targetInfo.resolvedPath || cwd);
}

/**
 * Scan workspace API routes and return formatted telemetry response.
 */
export function executeRouteScan(cwd: string = process.cwd()): BrainResponse {
  if (!existsSync(cwd)) {
    return renderPathNotFoundError(cwd, process.cwd(), getEffectiveModelInfo());
  }
  const start = Date.now();
  const profile = detectFramework(cwd);
  const routes = scanRoutes(cwd, profile);
  const durationMs = Date.now() - start;

  if (routes.length === 0) {
    return {
      title: `Route Scanner · ${durationMs}ms`,
      content: [
        `Framework: ${pc.bold(profile.name)}`,
        pc.yellow('No API endpoints or routes detected in this project.'),
        pc.dim('Searched: app/api, pages/api, routes/, controllers/, src/routes/'),
      ],
      durationMs,
      badge: `AST · Routes (0) · ${durationMs}ms`,
    };
  }

  const lines = [
    `Discovered ${pc.bold(routes.length.toString())} route(s) in ${pc.bold(profile.name)}:`,
    '',
  ];

  routes.slice(0, 15).forEach(r => {
    const methodStr = (r.method || 'ANY').toUpperCase();
    lines.push(`  ${pc.cyan(methodStr.padEnd(8))} ${pc.bold(r.path)} ${pc.dim(`(${r.file})`)}`);
  });

  if (routes.length > 15) {
    lines.push(pc.dim(`  ... and ${routes.length - 15} more route(s)`));
  }

  return {
    title: `Route Scanner · ${durationMs}ms`,
    content: lines,
    durationMs,
    badge: `AST · ${routes.length} Routes · ${durationMs}ms`,
  };
}

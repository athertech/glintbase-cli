/**
 * Run comprehensive ARS 3.0 agent readiness audit against a local codebase.
 * Evaluates white-box AST, configuration files, headers, routes,
 * and optional semantic artifacts.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { inspectWorkspaceGaps } from '../session/agentBrain.js';
import { scanRoutes } from '../ast/routeScanner.js';
import { inspectMiddleware } from '../ast/inspectors/middlewareInspector.js';
import { inspectRouteHeaders } from '../ast/inspectors/headerInspector.js';
import { inspectRouteAst } from '../ast/inspectors/routeAstInspector.js';
import { inspectCanaryRoutes } from '../ast/inspectors/canaryRouteInspector.js';
import { runArs3Probes } from './probes/index.js';
import { evaluateArtifactSemantics } from './aiEvaluator.js';
import { ArsSandbox } from './sandbox.js';
import type { Ars3Scorecard } from './checks/types.js';

export interface CodebaseAuditOptions {
  spec?: 'ars' | 'strict' | 'core';
  kind?: 'product' | 'docs' | 'ecommerce' | 'auto';
  simulate?: boolean;
  activeProvider?: any;
  isAiActive?: boolean;
  modelDisplayName?: string;
}

export async function runCodebaseArs3Audit(
  codebaseDir: string = process.cwd(),
  options: CodebaseAuditOptions = {}
): Promise<Ars3Scorecard> {
  const spec = options.spec || 'ars';
  const kind = options.kind || 'auto';
  const gaps = inspectWorkspaceGaps(codebaseDir);
  const routes = scanRoutes(codebaseDir, gaps.profile);
  const middlewareRes = inspectMiddleware(codebaseDir);
  const headerRes = inspectRouteHeaders(codebaseDir);
  const routeAstRes = inspectRouteAst(codebaseDir);
  const canaryRes = inspectCanaryRoutes(codebaseDir);

  let pkgJson: any = null;
  try {
    const pPath = join(codebaseDir, 'package.json');
    if (existsSync(pPath)) pkgJson = JSON.parse(readFileSync(pPath, 'utf-8'));
  } catch { /* malformed */ }

  const hasOpenApi = existsSync(join(codebaseDir, 'openapi.json'))
    || existsSync(join(codebaseDir, 'swagger.json'))
    || existsSync(join(codebaseDir, 'public', 'openapi.json'))
    || existsSync(join(gaps.profile.publicDir, 'openapi.json'))
    || routeAstRes.operationIdsCount > 0;

  const hasCommerceRoutes = routes.some(r => /checkout|stripe|pay|order|cart|billing/i.test(r.path));
  const hasStripeOrPayment = Boolean(
    pkgJson?.dependencies?.stripe ||
    pkgJson?.dependencies?.['@stripe/stripe-js'] ||
    hasCommerceRoutes
  );

  const authPath = join(gaps.profile.publicDir, 'auth.md');
  const authContent = existsSync(authPath) ? readFileSync(authPath, 'utf-8') : undefined;

  const llmsPath = join(gaps.profile.publicDir, 'llms.txt');
  const llmsContent = existsSync(llmsPath) ? readFileSync(llmsPath, 'utf-8') : undefined;

  const localContext = {
    hasClaudeRules: existsSync(join(codebaseDir, '.claude')),
    hasCursorRules: existsSync(join(codebaseDir, '.cursorrules')) || existsSync(join(codebaseDir, '.cursor')),
    hasWindsurfRules: existsSync(join(codebaseDir, '.windsurf')),
    hasPluginJson: existsSync(join(codebaseDir, 'plugin.json')),
    packageName: pkgJson?.name,
    hasOpenApiFile: hasOpenApi,
    hasLlmsFile: gaps.hasLlms,
    hasLlmsFullFile: existsSync(join(gaps.profile.publicDir, 'llms-full.txt')),
    middlewareHasVaryAccept: middlewareRes.setsVaryAccept,
    has404Handler: canaryRes.hasCustomNotFound,
    hasMcpRoute: gaps.hasMcp,
    hasAuthFile: gaps.hasAuth,
    authContent,
    routeCount: routes.length,
    hasIdempotencyKey: headerRes.hasIdempotencyKey,
    hasCommerceRoutes,
    hasStripeOrPayment,
    hasUcpFile: existsSync(join(gaps.profile.publicDir, '.well-known', 'ucp')),
    hasAcpFile: existsSync(join(codebaseDir, 'app', 'checkout_sessions')) || existsSync(join(codebaseDir, 'pages', 'api', 'checkout_sessions')),
  };

  const scorecard = await runArs3Probes('http://localhost:3000', {
    spec,
    kind,
    localContext,
  });

  // Empirical simulation
  if (options.simulate) {
    const sandbox = new ArsSandbox();
    scorecard.simulation = await sandbox.runSimulation('http://localhost:3000', {
      llmsContent,
      authContent,
      toolsCount: gaps.hasMcp ? 3 : 0,
    });
  }

  // Semantic Evaluations (AI or offline heuristic)
  const aiEvaluations: Record<string, any> = {};
  if (llmsContent) {
    aiEvaluations['llms.txt'] = await evaluateArtifactSemantics('llms.txt', llmsContent, options.activeProvider);
  }
  if (authContent) {
    aiEvaluations['auth.md'] = await evaluateArtifactSemantics('auth.md', authContent, options.activeProvider);
  }
  if (localContext.hasCursorRules || localContext.hasClaudeRules) {
    const rulesPath = existsSync(join(codebaseDir, '.cursorrules'))
      ? join(codebaseDir, '.cursorrules')
      : (existsSync(join(codebaseDir, '.claude')) ? join(codebaseDir, '.claude') : '');
    if (rulesPath && existsSync(rulesPath)) {
      const rulesContent = readFileSync(rulesPath, 'utf-8');
      aiEvaluations['agent-rules'] = await evaluateArtifactSemantics('rules', rulesContent, options.activeProvider);
    }
  }
  scorecard.aiEvaluations = aiEvaluations;
  scorecard.intelligence = options.isAiActive
    ? `${options.modelDisplayName || 'Active Model'} (Active)`
    : 'Deterministic AST & Probes Engine (Offline)';

  return scorecard;
}

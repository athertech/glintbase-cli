/**
 * Comprehensive ARS 3.0 Audit Engine Test Suite
 * Specification: GLINTBASE_AUDIT_3_0_UPGRADE_SPEC.md
 */

import { describe, it, expect } from 'vitest';
import { ALL_CHECKS, getChecksForLayer, getChecksForSpec, getBonusChecks } from '../src/core/checks/registry.js';
import { runArs3Probes } from '../src/core/probes/index.js';
import { classifyArchetype } from '../src/core/archetype.js';
import { getArsGrade } from '../src/core/scoreBand.js';
import { ArsSandbox } from '../src/core/sandbox.js';
import { inspectMiddleware } from '../src/ast/inspectors/middlewareInspector.js';
import { inspectRouteAst } from '../src/ast/inspectors/routeAstInspector.js';
import { inspectCanaryRoutes } from '../src/ast/inspectors/canaryRouteInspector.js';

describe('ARS 3.0 Check Taxonomy & Registry (119 Checks)', () => {
  it('registers exactly 119 open protocol checks across 4 layers', () => {
    expect(ALL_CHECKS.length).toBe(119);

    const l1 = getChecksForLayer('discovery');
    const l2 = getChecksForLayer('access');
    const l3 = getChecksForLayer('usability');
    const l4 = getChecksForLayer('payments');

    expect(l1.length).toBe(16);
    expect(l2.length).toBe(41);
    expect(l3.length).toBe(56);
    expect(l4.length).toBe(6);
  });

  it('filters 12 essential checks for --spec core', () => {
    const coreChecks = getChecksForSpec('core');
    expect(coreChecks.length).toBe(12);
    const ids = coreChecks.map(c => c.id);
    expect(ids).toContain('robots-ai-policy-quality');
    expect(ids).toContain('anti-spa-404');
    expect(ids).toContain('llms-txt-exists');
    expect(ids).toContain('openapi-spec');
    expect(ids).toContain('mcp-server-manifest');
  });

  it('identifies emerging bonus specifications', () => {
    const bonuses = getBonusChecks();
    expect(bonuses.length).toBeGreaterThan(15);
    const bonusIds = bonuses.map(b => b.id);
    expect(bonusIds).toContain('wikipedia-presence');
    expect(bonusIds).toContain('auth-md-structure');
    expect(bonusIds).toContain('auth-md-walkthrough-simulation');
    expect(bonusIds).toContain('webmcp');
    expect(bonusIds).toContain('acp-support');
  });
});

describe('Mathematical Scoring Engine & Dynamic Denominators', () => {
  it('calculates base denominators correctly by archetype', () => {
    const dev = classifyArchetype({ url: 'https://api.acme.com', kindOverride: 'product' });
    expect(dev.baseDenominator).toBe(85);

    const docs = classifyArchetype({ url: 'https://docs.acme.com', kindOverride: 'docs' });
    expect(docs.baseDenominator).toBe(85);

    const store = classifyArchetype({ url: 'https://store.acme.com', kindOverride: 'ecommerce' });
    expect(store.baseDenominator).toBe(100);

    const blog = classifyArchetype({ url: 'https://blog.acme.com/news' });
    expect(blog.canonicalArchetype).toBe('content_media');
    expect(blog.baseDenominator).toBe(50);
  });

  it('ensures unearned bonus points do NOT inflate the denominator or penalize score', async () => {
    const scorecard = await runArs3Probes('http://localhost:3000', {
      kind: 'docs',
      localContext: {
        hasLlmsFile: false,
        hasAuthFile: false,
        hasOpenApiFile: false,
      },
    });

    // When bonus points are 0, active denominator must equal base denominator
    if (scorecard.bonusEarned === 0) {
      expect(scorecard.activeDenominator).toBe(scorecard.baseDenominator);
    } else {
      expect(scorecard.activeDenominator).toBe(scorecard.baseDenominator + scorecard.bonusEarned);
    }
    expect(scorecard.score).toBeGreaterThanOrEqual(0);
    expect(scorecard.score).toBeLessThanOrEqual(100);
  });

  it('adds earned bonus points to BOTH numerator and denominator', async () => {
    const scorecardWithBonuses = await runArs3Probes('http://localhost:3000', {
      kind: 'product',
      localContext: {
        hasLlmsFile: true,
        hasAuthFile: true,
        hasOpenApiFile: true,
        authContent: `# Authentication Guide\n## Discover\n## Pick a Method (bearer)\n## Register client\n## Claim token\n## Exchange grant\n## Use bearer\n## Errors\n## Revocation`,
        middlewareHasVaryAccept: true,
        hasMcpRoute: true,
      },
    });

    expect(scorecardWithBonuses.bonusEarned).toBeGreaterThan(0);
    expect(scorecardWithBonuses.activeDenominator).toBe(
      scorecardWithBonuses.baseDenominator + scorecardWithBonuses.bonusEarned
    );
    expect(scorecardWithBonuses.totalEarned).toBe(
      scorecardWithBonuses.baseEarned + scorecardWithBonuses.bonusEarned
    );
  });
});

describe('Letter Grade Alignment (ARS 3.0 Standard)', () => {
  it('correctly maps scores to ARS 3.0 letter grade bands', () => {
    expect(getArsGrade(98).grade).toBe('A+');
    expect(getArsGrade(95).grade).toBe('A+');
    expect(getArsGrade(90).grade).toBe('A');
    expect(getArsGrade(86).grade).toBe('A');
    expect(getArsGrade(80).grade).toBe('B');
    expect(getArsGrade(70).grade).toBe('B');
    expect(getArsGrade(55).grade).toBe('C');
    expect(getArsGrade(35).grade).toBe('D');
    expect(getArsGrade(15).grade).toBe('F');
  });
});

describe('Kind-Aware MCP Evaluation Rubric', () => {
  it('rewards Docs MCP for focused 1-3 tool surfaces and zero auth', async () => {
    const docsScorecard = await runArs3Probes('http://localhost:3000', {
      kind: 'docs',
      localContext: {
        hasMcpRoute: true,
      },
    });

    const focusCheck = docsScorecard.results.find(c => c.checkId === 'mcp-tools-focus');
    expect(focusCheck).toBeDefined();
    expect(focusCheck?.status).toBe('pass');
    expect(focusCheck?.earnedPoints).toBe(3);

    const breadthCheck = docsScorecard.results.find(c => c.checkId === 'mcp-tools-breadth');
    expect(breadthCheck?.status).toBe('skip');
  });

  it('rewards Product MCP for tool breadth (>=3 tools)', async () => {
    const prodScorecard = await runArs3Probes('http://localhost:3000', {
      kind: 'product',
      localContext: {
        hasMcpRoute: true,
      },
    });

    const breadthCheck = prodScorecard.results.find(c => c.checkId === 'mcp-tools-breadth');
    expect(breadthCheck).toBeDefined();
    expect(breadthCheck?.status).toBe('pass');
    expect(breadthCheck?.earnedPoints).toBe(3);

    const focusCheck = prodScorecard.results.find(c => c.checkId === 'mcp-tools-focus');
    expect(focusCheck?.status).toBe('skip');
  });
});

describe('WorkOS auth.md 8-Stage Parser & Non-Mutating GET Simulation', () => {
  it('detects and rewards canonical 8-stage auth.md handbook', async () => {
    const completeAuth = `
# Machine Authentication
## 1. Discover Endpoints at /.well-known/oauth-protected-resource
## 2. Pick a Method (service_auth / id-jag / bearer)
## 3. Register Machine Client using curl POST /register
## 4. Claim Token via claim_token and verification_uri
## 5. Exchange Grant URN for bearer token at /token
## 6. Use Authorization: Bearer <token>
## 7. Errors: invalid_claim_token and authorization_pending
## 8. Revocation: secevent+jwt token revocation
`;

    const scorecard = await runArs3Probes('http://localhost:3000', {
      localContext: {
        hasAuthFile: true,
        authContent: completeAuth,
      },
    });

    const structCheck = scorecard.results.find(c => c.checkId === 'auth-md-structure');
    expect(structCheck).toBeDefined();
    expect(structCheck?.status).toBe('pass');
    expect(structCheck?.earnedPoints).toBe(2);

    const simCheck = scorecard.results.find(c => c.checkId === 'auth-md-walkthrough-simulation');
    expect(simCheck).toBeDefined();
    expect(simCheck?.status).toBe('pass');
  });
});

describe('Payments & Machine Commerce OR-Scoring Rule', () => {
  it('awards full 10 points when any 1 verified payment protocol is present', async () => {
    const storeScorecard = await runArs3Probes('http://localhost:3000', {
      kind: 'ecommerce',
      localContext: {
        hasCommerceRoutes: true,
        hasUcpFile: true, // Supporting UCP
      },
    });

    expect(storeScorecard.layers.payments.applicable).toBe(true);
    expect(storeScorecard.layers.payments.totalEarned).toBe(10);

    const ucpCheck = storeScorecard.results.find(c => c.checkId === 'ucp-support');
    expect(ucpCheck?.status).toBe('pass');

    // Remaining payment checks must be marked 'na' under OR-scoring, never 'fail'
    const acpCheck = storeScorecard.results.find(c => c.checkId === 'acp-support');
    expect(acpCheck?.status).toBe('na');
  });

  it('skips payments layer entirely for non-commerce sites', async () => {
    const devScorecard = await runArs3Probes('http://localhost:3000', {
      kind: 'product',
      localContext: {
        hasCommerceRoutes: false,
      },
    });

    expect(devScorecard.layers.payments.applicable).toBe(false);
    expect(devScorecard.layers.payments.totalEarned).toBe(0);

    for (const pCheck of devScorecard.layers.payments.checks) {
      expect(pCheck.status).toBe('skip');
    }
  });
});

describe('White-Box AST Codebase Inspectors', () => {
  it('inspects route AST and synthesizes in-memory OpenAPI 3.1 schema', () => {
    const astRes = inspectRouteAst(process.cwd());
    expect(astRes).toBeDefined();
    expect(typeof astRes.discoveredRoutesCount).toBe('number');
    expect(astRes.synthesizedOpenApi).toBeDefined();
    expect(astRes.synthesizedOpenApi.openapi).toBe('3.1.0');
  });

  it('inspects middleware for Vary: Accept and bot routing', () => {
    const midRes = inspectMiddleware(process.cwd());
    expect(midRes).toBeDefined();
    expect(typeof midRes.found).toBe('boolean');
  });

  it('inspects canary routes for authentic 404 handlers', () => {
    const canaryRes = inspectCanaryRoutes(process.cwd());
    expect(canaryRes).toBeDefined();
    expect(typeof canaryRes.hasCustomNotFound).toBe('boolean');
  });
});

describe('Empirical Agent Simulation Engine', () => {
  it('executes in-memory simulation in ArsSandbox without external API keys', async () => {
    const sandbox = new ArsSandbox();
    const simResult = await sandbox.runSimulation('http://localhost:3000', {
      llmsContent: '# Acme Docs\n> API reference\n- [APIs](http://localhost:3000/api)',
      authContent: '# Auth Guide\n## Discover\n## Pick a Method (bearer)\n## Register\n## Claim\n## Exchange\n## Use Authorization: Bearer',
      toolsCount: 3,
    });

    expect(simResult.passed).toBe(true);
    expect(simResult.metrics.ragNavigationSteps).toBeLessThanOrEqual(3);
    expect(simResult.metrics.authStagesResolved).toBeGreaterThanOrEqual(3);
    expect(simResult.metrics.toolsVerified).toBe(3);
    expect(simResult.details.length).toBeGreaterThan(0);
  });
});

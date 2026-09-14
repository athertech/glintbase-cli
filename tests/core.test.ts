import { describe, it, expect } from 'vitest';
import { classifyArchetype } from '../src/core/archetype.js';
import { scoreBand, scoreBandLabel } from '../src/core/scoreBand.js';
import { validateScanUrl } from '../src/core/urlPolicy.js';

describe('ARS 2.0 Archetype Classifier & Dynamic Denominator', () => {
  it('correctly classifies developer documentation as devtool archetype', () => {
    const profile = classifyArchetype({
      url: 'https://docs.stripe.com/api',
      title: 'Stripe API Reference and Developer Documentation',
      surfaces: [{ type: 'openapi', found: true }, { type: 'docs', found: true }],
    });

    expect(profile.archetype).toBe('devtool');
    expect(profile.totalDenominator).toBe(85);
    expect(profile.layerWeights.payments).toBe(0);
    expect(profile.excludedLayers.length).toBeGreaterThan(0);
    expect(profile.excludedLayers[0].layer).toBe('Payments');
  });

  it('correctly classifies an e-commerce storefront and activates payments layer', () => {
    const profile = classifyArchetype({
      url: 'https://store.example.com/checkout',
      title: 'Official Store — Buy Now with Free Shipping',
      html: '<div>Add to cart and checkout now. Currency: USD. In stock.</div>',
    });

    expect(profile.archetype).toBe('ecommerce');
    expect(profile.totalDenominator).toBe(100);
    expect(profile.layerWeights.payments).toBe(10);
    expect(profile.activeLayers).toContain('payments');
    expect(profile.excludedLayers.length).toBe(0);
  });
});

describe('Score Bands', () => {
  it('maps scores to correct grade labels', () => {
    expect(scoreBandLabel(95)).toBe('Agent-Native');
    expect(scoreBandLabel(78)).toBe('AI-Friendly');
    expect(scoreBandLabel(52)).toBe('AI-Capable');
    expect(scoreBandLabel(20)).toBe('Legacy Ecosystem');
  });
});

describe('URL Policy & SSRF Protection', () => {
  it('accepts valid public https targets', () => {
    const res = validateScanUrl('https://api.github.com');
    expect(res.ok).toBe(true);
    expect(res.url).toBe('https://api.github.com/');
  });

  it('permits localhost and dev ports for local audits', () => {
    const res = validateScanUrl('http://localhost:3000');
    expect(res.ok).toBe(true);
    expect(res.url).toBe('http://localhost:3000/');
  });

  it('blocks cloud metadata endpoints', () => {
    const res = validateScanUrl('http://metadata.google.internal');
    expect(res.ok).toBe(false);
    expect(res.code).toBe('SSRF_BLOCKED');
  });

  it('correctly defaults bare localhost to http scheme', () => {
    const res = validateScanUrl('localhost:3000');
    expect(res.ok).toBe(true);
    expect(res.url).toBe('http://localhost:3000/');
  });
});

import { resolveAuditTarget } from '../src/core/urlPolicy.js';
import { evaluateOfflineHeuristic } from '../src/core/aiEvaluator.js';

describe('Target Resolution (resolveAuditTarget)', () => {
  it('resolves bare localhost:3000 to http://localhost:3000/', () => {
    const target = resolveAuditTarget('localhost:3000');
    expect(target.isUrl).toBe(true);
    expect(target.normalizedUrl).toBe('http://localhost:3000/');
  });

  it('resolves 127.0.0.1:8000 to http://127.0.0.1:8000/', () => {
    const target = resolveAuditTarget('127.0.0.1:8000');
    expect(target.isUrl).toBe(true);
    expect(target.normalizedUrl).toBe('http://127.0.0.1:8000/');
  });

  it('resolves bare domain glintbase.dev to https://glintbase.dev/', () => {
    const target = resolveAuditTarget('glintbase.dev');
    expect(target.isUrl).toBe(true);
    expect(target.normalizedUrl).toBe('https://glintbase.dev/');
  });

  it('resolves explicit URL directly', () => {
    const target = resolveAuditTarget('https://glintbase.dev/docs');
    expect(target.isUrl).toBe(true);
    expect(target.normalizedUrl).toBe('https://glintbase.dev/docs');
  });

  it('resolves . or empty to codebase directory', () => {
    const target = resolveAuditTarget('.');
    expect(target.isUrl).toBe(false);
    expect(target.target).toBe(process.cwd());
  });
});

describe('AI Evaluator Offline Heuristics', () => {
  it('evaluates valid llms.txt structure', () => {
    const content = `# Acme API Context
> Machine-actionable guides and API specifications.
- [API Reference](https://acme.com/api): REST endpoints
- [Authentication](https://acme.com/auth): OAuth & tokens
- [MCP Server](https://acme.com/mcp): Model Context Protocol tools`;

    const res = evaluateOfflineHeuristic('llms.txt', content);
    expect(res.passed).toBe(true);
    expect(res.score).toBeGreaterThanOrEqual(70);
    expect(res.evaluatedWithAi).toBe(false);
  });

  it('flags incomplete llms.txt missing H1 and links', () => {
    const res = evaluateOfflineHeuristic('llms.txt', 'Just some random text without markdown structure.');
    expect(res.passed).toBe(false);
    expect(res.issues.length).toBeGreaterThan(0);
  });
});


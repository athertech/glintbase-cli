import { describe, it, expect } from 'vitest';
import {
  getPersona,
  estimateTokenCount,
  calculateDollarTax,
  evaluateSchemaFriction,
  SchemaFrictionEvaluator,
  SafetyGuard,
  IntentParser,
  runSimulation,
  DeterministicEngine,
  CounterfactualHarness
} from '../src/simulator/index.js';

describe('Glintbase Agent Flight Simulator (Track 3)', () => {
  describe('Agent Personas & Constraints', () => {
    it('initializes Claude Code persona with 200k context and MCP manifest priority', () => {
      const persona = getPersona('claude-code');
      expect(persona.name).toBe('Claude Code');
      expect(persona.maxContextTokens).toBe(200_000);
      expect(persona.targetManifests).toContain('.well-known/mcp/manifest.json');
      expect(persona.targetManifests).toContain('llms.txt');
    });

    it('initializes Cursor persona with 128k context and rules priority', () => {
      const persona = getPersona('cursor');
      expect(persona.name).toBe('Cursor');
      expect(persona.maxContextTokens).toBe(128_000);
      expect(persona.targetManifests).toContain('.cursorrules');
    });

    it('initializes Perplexity persona with 32k context and search engine crawler policy', () => {
      const persona = getPersona('perplexity');
      expect(persona.name).toBe('Perplexity Sonar');
      expect(persona.maxContextTokens).toBe(32_000);
      expect(persona.crawlerUserAgent).toContain('PerplexityBot');
    });
  });

  describe('Telemetry - Token Tax & Dollar Tax Telemetry', () => {
    it('estimates token counts accurately using BPE subword splitting', () => {
      const text = '# Glintbase API\nWelcome to the autonomous agent protocol documentation.';
      const count = estimateTokenCount(text);
      expect(count).toBeGreaterThan(10);
      expect(count).toBeLessThan(30);
    });

    it('calculates dollar tax accurately at $3/M in and $15/M out', () => {
      const tax = calculateDollarTax(1_000_000, 100_000);
      // 1M * 3.0 + 0.1M * 15.0 = 3.0 + 1.5 = 4.5 USD
      expect(tax).toBe(4.5);
    });
  });

  describe('Telemetry - Schema Friction Index', () => {
    it('scores a flawless schema with 0 friction', () => {
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique user identifier' },
          query: { type: 'string', description: 'Search term' }
        },
        required: ['id', 'query']
      };
      const result = SchemaFrictionEvaluator.analyzeSchema(schema);
      expect(result.score).toBe(0);
      expect(result.rating).toBe('Flawless');
    });

    it('penalizes schemas with missing required array and parameter name/unit mismatch', () => {
      const badSchema = {
        type: 'object',
        properties: {
          amount_cents: { type: 'number', description: 'Transaction amount in dollars' },
          metadata: {} // untyped
        }
      };
      const result = evaluateSchemaFriction(badSchema);
      expect(result.score).toBeGreaterThan(40);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe('Missions - Safety Guardrail', () => {
    it('allows read-only tools and GET queries without mutations', () => {
      const check = SafetyGuard.inspectToolAction('get_user_profile', {}, { readOnlyHint: true });
      expect(check.allowed).toBe(true);
      expect(check.isMutation).toBe(false);
    });

    it('intercepts destructive mutations and provides synthetic dry-run when mutations not allowed', () => {
      const check = SafetyGuard.inspectToolAction('delete_all_records', { id: '123' }, undefined, false);
      expect(check.isMutation).toBe(true);
      expect(check.allowed).toBe(false);
      expect(check.syntheticResponse).toBeDefined();
      expect(check.syntheticResponse?.dryRun).toBe(true);
    });

    it('permits destructive mutations when explicitly authorized with --allow-mutations', () => {
      const check = SafetyGuard.inspectToolAction('delete_record', { id: '123' }, undefined, true);
      expect(check.isMutation).toBe(true);
      expect(check.allowed).toBe(true);
    });
  });

  describe('Missions - Intent Parser', () => {
    it('parses read intents and matches candidate tools', () => {
      const tools = [
        { name: 'fetch_billing_history', description: 'Fetch billing invoices and charges' },
        { name: 'delete_account', description: 'Delete user account' }
      ];
      const parsed = IntentParser.parse('fetch billing history for customer', tools);
      expect(parsed.actionVerb).toBe('fetch');
      expect(parsed.isMutating).toBe(false);
      expect(parsed.matchedTool?.name).toBe('fetch_billing_history');
    });

    it('identifies mutating intent verbs', () => {
      const parsed = IntentParser.parse('delete all stale sessions');
      expect(parsed.actionVerb).toBe('delete');
      expect(parsed.isMutating).toBe(true);
    });
  });

  describe('Deterministic Flight Simulation & Counterfactual Sandbox', () => {
    it('runs deterministic simulation and produces full 5-phase trajectory', async () => {
      const result = await runSimulation({
        target: '.',
        agent: 'claude-code',
        mode: 'deterministic'
      });

      expect(result.telemetry).toBeDefined();
      expect(result.telemetry.steps.length).toBeGreaterThanOrEqual(5);
      expect(result.telemetry.steps.map(s => s.phase)).toEqual(
        expect.arrayContaining(['discovery', 'ingestion', 'auth', 'execution', 'recovery'])
      );
      expect(result.telemetry.totalTokensBurned).toBeGreaterThan(0);
      expect(result.telemetry.dollarTaxUsd).toBeGreaterThanOrEqual(0);
    });

    it('blocks trajectory gracefully when custom intent has no matching tools and suggests fix', async () => {
      const result = await runSimulation({
        target: '.',
        agent: 'claude-code',
        intent: 'teleport quantum state to Andromeda galaxy'
      });

      expect(result.telemetry.outcome).toBe('blocked');
      expect(result.telemetry.failureBottleneck).toContain('teleport quantum state');
      expect(result.counterfactual).toBeDefined();
      expect(result.counterfactual?.resolved).toBe(true);
    });

    it('computes counterfactual comparison with token and latency savings', async () => {
      const persona = getPersona('claude-code');
      const baselineContext = {
        targetUrl: 'https://api.test-site.io',
        isUrl: true,
        mcpTools: []
      };
      const baselineTelemetry = await DeterministicEngine.run(persona, baselineContext, { target: 'https://api.test-site.io' });
      const cf = await CounterfactualHarness.evaluate(persona, baselineContext, { target: 'https://api.test-site.io' }, baselineTelemetry);

      expect(cf.before).toBeDefined();
      expect(cf.after).toBeDefined();
      expect(cf.fixedBottlenecks.length).toBeGreaterThan(0);
      expect(cf.after.outcome).toBe('completed');
    });
  });
});

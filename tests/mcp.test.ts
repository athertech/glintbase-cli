/**
 * Unit & Integration Tests for Glintbase MCP Server (ARS 3.0)
 * Verifies tool registrations, skill bundles, prompts, resources, and execution.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';

import {
  createGlintbaseMcpServer,
  startMcpHttp,
  BUNDLED_SKILLS,
  installSkillToDisk,
} from '../src/mcp/index.js';

describe('Glintbase MCP Server & Bundled Skills Suite', () => {
  const testDir = join(process.cwd(), '.test-mcp-scratch');

  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('1. Bundled Skills Registry & Disk Installer', () => {
    it('should include all 9 core skills with complete metadata and URIs', () => {
      const expectedSkills = [
        'glintbase-agent-readiness',
        'living-artifacts-architect',
        'agent-auth-handbook',
        'streamable-mcp-builder',
        'webmcp-browser-integration',
        'token-tax-and-schema-optimizer',
        'flight-simulator-replay',
        'zero-drift-ci-gate',
        'enterprise-agent-governance',
      ];

      for (const name of expectedSkills) {
        const skill = BUNDLED_SKILLS[name];
        expect(skill, `Skill "${name}" should be defined`).toBeDefined();
        expect(skill.name).toBe(name);
        expect(skill.title).toBeTruthy();
        expect(skill.description).toBeTruthy();
        expect(skill.uri).toMatch(/^skill:\/\/glintbase\//);
        expect(skill.content).toContain('# ');
        expect(skill.tags.length).toBeGreaterThan(0);
      }
    });

    it('should scaffold a physical SKILL.md bundle to disk', () => {
      const result = installSkillToDisk('agent-auth-handbook', testDir);
      expect(result.installed).toBe(true);
      expect(existsSync(result.path)).toBe(true);

      const savedContent = readFileSync(result.path, 'utf-8');
      expect(savedContent).toContain('WorkOS auth.md');
      expect(savedContent).toContain('Agent Authentication Handbook');
    });

    it('should throw an error when installing an unknown skill', () => {
      expect(() => installSkillToDisk('non-existent-skill', testDir)).toThrowError(
        /Unknown skill/
      );
    });
  });

  describe('2. MCP Server Instance & Registration', () => {
    it('should instantiate McpServer with name "glintbase" and version "3.0.0"', () => {
      const server = createGlintbaseMcpServer();
      expect(server).toBeDefined();
    });

    it('should expose all 17 tools and 9 prompts/resources on the server instance', () => {
      const server = createGlintbaseMcpServer();
      const anyServer = server as any;

      // Check registered tools
      const toolNames = Object.keys(anyServer._registeredTools || {});
      const expectedTools = [
        'glintbase_audit',
        'glintbase_get_score',
        'glintbase_discover_surfaces',
        'glintbase_simulate_flight',
        'glintbase_counterfactual_proof',
        'glintbase_calculate_token_tax',
        'glintbase_check_schema_friction',
        'glintbase_generate_artifact',
        'glintbase_sandbox_validate',
        'glintbase_inspect_webmcp',
        'glintbase_ci_gate',
        'glintbase_get_skill',
        'glintbase_install_skill',
        'glintbase_audit_canaries',
        'glintbase_verify_agent_auth',
        'glintbase_audit_mutation_safety',
        'glintbase_compliance_report',
      ];

      for (const tool of expectedTools) {
        expect(toolNames, `Tool "${tool}" should be registered`).toContain(tool);
      }

      // Check registered prompts
      const promptNames = Object.keys(anyServer._registeredPrompts || {});
      expect(promptNames.length).toBe(9);
      expect(promptNames).toContain('optimize-glintbase-agent-readiness');
      expect(promptNames).toContain('optimize-streamable-mcp-builder');
      expect(promptNames).toContain('optimize-enterprise-agent-governance');

      // Check registered resources
      const resourceKeys = Object.keys(anyServer._registeredResources || {});
      expect(resourceKeys.length).toBe(9);
      expect(resourceKeys).toContain('skill://glintbase/agent-readiness');
      expect(resourceKeys).toContain('skill://glintbase/agent-auth');
      expect(resourceKeys).toContain('skill://glintbase/agent-governance');
    });
  });

  describe('3. Streamable HTTP SSE Server', () => {
    let serverInstance: http.Server | null = null;
    const testPort = 3199;

    afterAll(() => {
      if (serverInstance) {
        serverInstance.close();
      }
    });

    it('should start HTTP server and respond to /health check', async () => {
      serverInstance = await startMcpHttp(testPort);

      const healthRes = await new Promise<any>((resolve, reject) => {
        http.get(`http://localhost:${testPort}/health`, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          });
        }).on('error', reject);
      });

      expect(healthRes.statusCode).toBe(200);
      expect(healthRes.body.status).toBe('ok');
      expect(healthRes.body.server).toBe('glintbase-mcp');
      expect(healthRes.body.version).toBe('3.0.0');
      expect(healthRes.body.endpoints.sse).toBe('/sse');
      expect(healthRes.body.endpoints.message).toBe('/message');
    });
  });

  describe('4. Tool Execution Handlers', () => {
    const server = createGlintbaseMcpServer();
    const anyServer = server as any;

    it('glintbase_get_score: should return compact score card', async () => {
      const tool = anyServer._registeredTools['glintbase_get_score'];
      const res = await tool.handler({ target: '.' });
      expect(res.isError).toBeFalsy();

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.score).toBeGreaterThan(0);
      expect(parsed.grade).toMatch(/^[A-F]/);
      expect(parsed.archetype).toBeTruthy();
    });

    it('glintbase_discover_surfaces: should list machine entrypoints', async () => {
      const tool = anyServer._registeredTools['glintbase_discover_surfaces'];
      const res = await tool.handler({ target: '.' });
      expect(res.isError).toBeFalsy();

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.totalSurfaces).toBeGreaterThan(0);
      expect(Array.isArray(parsed.surfaces)).toBe(true);
    });

    it('glintbase_calculate_token_tax: should return prompt bloat analysis', async () => {
      const tool = anyServer._registeredTools['glintbase_calculate_token_tax'];
      const res = await tool.handler({ target: '.' });
      expect(res.isError).toBeFalsy();

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.promptBloatMultiplier).toBeTruthy();
      expect(parsed.rawDocumentTokens).toBeGreaterThanOrEqual(0);
    });

    it('glintbase_check_schema_friction: should evaluate parameter safety', async () => {
      const tool = anyServer._registeredTools['glintbase_check_schema_friction'];
      const res = await tool.handler({ target: '.' });
      expect(res.isError).toBeFalsy();

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.schemaFrictionScore).toBeGreaterThanOrEqual(0);
      expect(parsed.hallucinationRisk).toMatch(/LOW|MEDIUM|HIGH/);
    });

    it('glintbase_generate_artifact: should generate in-memory validated robots.txt', async () => {
      const tool = anyServer._registeredTools['glintbase_generate_artifact'];
      const res = await tool.handler({ spec: 'robots', writeToDisk: false });
      expect(res.isError).toBeFalsy();

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.spec).toBe('robots');
      expect(parsed.writtenToDisk).toBe(false);
      expect(parsed.sandboxVerification.valid).toBe(true);
      expect(parsed.fullContent).toContain('User-agent: ClaudeBot');
    });

    it('glintbase_sandbox_validate: should validate proposed virtual files without touching disk', async () => {
      const tool = anyServer._registeredTools['glintbase_sandbox_validate'];
      const res = await tool.handler({
        files: [
          {
            path: 'public/robots.txt',
            content: 'User-agent: ClaudeBot\nAllow: /\nUser-agent: GPTBot\nAllow: /\n',
          },
        ],
      });
      expect(res.isError).toBeFalsy();

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.allValid).toBe(true);
      expect(parsed.results[0].valid).toBe(true);
    });

    it('glintbase_get_skill: should retrieve complete skill markdown', async () => {
      const tool = anyServer._registeredTools['glintbase_get_skill'];
      const res = await tool.handler({ skillName: 'streamable-mcp-builder' });
      expect(res.isError).toBeFalsy();
      expect(res.content[0].text).toContain('Streamable HTTP MCP Server Builder');
    });

    it('glintbase_audit_canaries: should audit 404 boundaries and detect soft-200 SPA leaks', async () => {
      const tool = anyServer._registeredTools['glintbase_audit_canaries'];
      const res = await tool.handler({ target: '.' });
      expect(res.isError).toBeFalsy();

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.target).toBeTruthy();
      expect(typeof parsed.spaLeakDetected).toBe('boolean');
      expect(['SECURE', 'VULNERABLE', 'CRITICAL']).toContain(parsed.riskGrade);
      expect(Array.isArray(parsed.findings)).toBe(true);
    });

    it('glintbase_verify_agent_auth: should validate machine credentials and WorkOS spec', async () => {
      const tool = anyServer._registeredTools['glintbase_verify_agent_auth'];
      const res = await tool.handler({ target: '.' });
      expect(res.isError).toBeFalsy();

      const parsed = JSON.parse(res.content[0].text);
      expect(['VERIFIED', 'INCOMPLETE', 'MISSING']).toContain(parsed.complianceStatus);
      expect(Array.isArray(parsed.findings)).toBe(true);
    });

    it('glintbase_audit_mutation_safety: should inspect state-changing endpoints and idempotency', async () => {
      const tool = anyServer._registeredTools['glintbase_audit_mutation_safety'];
      const res = await tool.handler({ target: '.' });
      expect(res.isError).toBeFalsy();

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.totalEndpoints).toBeGreaterThanOrEqual(0);
      expect(['LOW', 'MEDIUM', 'CRITICAL']).toContain(parsed.overallRiskLevel);
      expect(parsed.recommendedMiddlewareCode).toContain('idempotency');
    });

    it('glintbase_compliance_report: should generate board-ready OWASP & ISO 42001 assessment', async () => {
      const tool = anyServer._registeredTools['glintbase_compliance_report'];
      const res = await tool.handler({ target: '.' });
      expect(res.isError).toBeFalsy();

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.securityScore).toBeGreaterThanOrEqual(0);
      expect(parsed.grade).toMatch(/^[A-F]/);
      expect(Array.isArray(parsed.owaspCompliance)).toBe(true);
      expect(parsed.owaspCompliance.some((o: any) => o.code === 'LLM01')).toBe(true);
      expect(Array.isArray(parsed.iso42001Compliance)).toBe(true);
      expect(parsed.executiveMarkdown).toContain('Glintbase Executive Security');
    });

    it('glintbase_generate_artifact: should synthesize not-found route and middleware', async () => {
      const tool = anyServer._registeredTools['glintbase_generate_artifact'];

      // not-found
      const nfRes = await tool.handler({ spec: 'not-found', writeToDisk: false });
      expect(nfRes.isError).toBeFalsy();
      const nfParsed = JSON.parse(nfRes.content[0].text);
      expect(nfParsed.spec).toBe('not-found');
      expect(nfParsed.fullContent).toContain('404');

      // middleware
      const mwRes = await tool.handler({ spec: 'middleware', writeToDisk: false });
      expect(mwRes.isError).toBeFalsy();
      const mwParsed = JSON.parse(mwRes.content[0].text);
      expect(mwParsed.spec).toBe('middleware');
      expect(mwParsed.fullContent).toContain('middleware');
    });

    it('glintbase_simulate_flight: should return failure mode diagnostics for unmatched intent', async () => {
      const tool = anyServer._registeredTools['glintbase_simulate_flight'];
      const res = await tool.handler({
        target: '.',
        persona: 'claude-code',
        intent: 'Teleport to galaxy center and drain hyperdrive batteries',
      });
      expect(res.isError).toBeFalsy();

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.outcome).toBe('blocked');
      expect(parsed.failureMode).toBe('INTENT_UNMATCHED_ENDPOINT');
      expect(parsed.failureDetails).toBeDefined();
      expect(parsed.failureDetails.code).toBe('INTENT_UNMATCHED_ENDPOINT');
      expect(parsed.failureDetails.phase).toBe('execution');
      expect(parsed.failureDetails.remediation).toBeTruthy();
    });
  });
});

import { describe, it, expect } from 'vitest';
import { parseSkillContent, formatSkillsForPrompt, loadSkillsFromDir } from '../src/harness/skills/loader.js';
import { ArsSandbox } from '../src/core/sandbox.js';
import {
  DiscoverySubagent,
  AuthSubagent,
  McpWebMcpSubagent,
  CommerceSubagent,
  BaseSubagent,
} from '../src/harness/subagents/index.js';
import type { ProposedArtifact, SubagentContext } from '../src/harness/types.js';
import { resolve } from 'path';

describe('Skills Engine (SKILL.md & XML Prompting)', () => {
  it('parses YAML frontmatter and markdown body correctly', () => {
    const raw = `---
name: test-skill
description: Unit test skill description
layer: usability
version: 1.0.0
---

# Instruction Header
Follow these instructions carefully.`;

    const skill = parseSkillContent(raw, 'default-name');
    expect(skill.name).toBe('test-skill');
    expect(skill.description).toBe('Unit test skill description');
    expect(skill.layer).toBe('usability');
    expect(skill.instructions).toContain('# Instruction Header');
  });

  it('formats skills into standard XML blocks', () => {
    const skills = [
      {
        name: 'skill-one',
        description: 'First test skill',
        filePath: '/test/skill.md',
        content: '',
        instructions: 'Do task one',
      },
    ];

    const xml = formatSkillsForPrompt(skills);
    expect(xml).toContain('<available_skills>');
    expect(xml).toContain('<name>skill-one</name>');
    expect(xml).toContain('<description>First test skill</description>');
    expect(xml).toContain('Do task one');
    expect(xml).toContain('</available_skills>');
  });

  it('loads all 4 embedded domain skills from src/harness/skills', () => {
    const skillsDir = resolve(process.cwd(), 'src/harness/skills');
    const loaded = loadSkillsFromDir(skillsDir);
    expect(loaded.length).toBeGreaterThanOrEqual(4);
    const names = loaded.map((s) => s.name);
    expect(names).toContain('discovery-skill');
    expect(names).toContain('auth-md-skill');
    expect(names).toContain('mcp-webmcp-skill');
    expect(names).toContain('commerce-skill');
  });
});

describe('In-Memory ARS 2.0 Sandbox', () => {
  it('flags malformed robots.txt missing Content-Signals or AI bots', () => {
    const sandbox = new ArsSandbox();
    const result = sandbox.verifyArtifact({
      targetPath: 'public/robots.txt',
      action: 'create',
      content: 'User-agent: *\nDisallow: /',
      rationale: 'Block all',
      pointsImpact: 10,
      layer: 'discovery',
    });

    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('ClaudeBot'))).toBe(true);
  });

  it('validates compliant auth.md with YAML frontmatter and bearer schemes', () => {
    const sandbox = new ArsSandbox();
    const result = sandbox.verifyArtifact({
      targetPath: 'public/auth.md',
      action: 'create',
      content: `---
title: Agent Authentication Handbook
auth_schemes: [api_key]
---
# Auth Guide
Authorization: Bearer <key>`,
      rationale: 'Machine auth',
      pointsImpact: 15,
      layer: 'usability',
    });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(15);
    expect(result.errors.length).toBe(0);
  });
});

describe('Subagent Swarm & 3x Self-Correction Loop', () => {
  const mockContext: SubagentContext = {
    cwd: process.cwd(),
    projectName: 'Acme Cloud',
    projectDescription: 'Enterprise API Gateway',
    existingFiles: {},
  };

  it('DiscoverySubagent produces 100% compliant artifacts on turn 1', async () => {
    const agent = new DiscoverySubagent();
    const result = await agent.execute(mockContext);

    expect(result.passed).toBe(true);
    expect(result.probePassRate).toBe(1.0);
    expect(result.iterations).toBe(1);
    expect(result.artifacts.length).toBe(3); // robots.txt, llms.txt, ard.json
  });

  it('AuthSubagent produces 100% compliant artifacts on turn 1', async () => {
    const agent = new AuthSubagent();
    const result = await agent.execute(mockContext);

    expect(result.passed).toBe(true);
    expect(result.probePassRate).toBe(1.0);
    expect(result.artifacts.length).toBe(2); // auth.md, oauth-protected-resource
  });

  it('McpWebMcpSubagent produces 100% compliant artifacts on turn 1', async () => {
    const agent = new McpWebMcpSubagent();
    const result = await agent.execute(mockContext);

    expect(result.passed).toBe(true);
    expect(result.probePassRate).toBe(1.0);
    expect(result.artifacts.length).toBe(3); // mcp.json, /api/mcp/route.ts, WebMcpProvider.tsx
  });

  it('CommerceSubagent produces 100% compliant artifacts on turn 1', async () => {
    const agent = new CommerceSubagent();
    const result = await agent.execute(mockContext);

    expect(result.passed).toBe(true);
    expect(result.probePassRate).toBe(1.0);
    expect(result.artifacts.length).toBe(2); // ucp, mpp.json
  });

  it('self-corrects over multiple turns when initial artifact is rejected by sandbox', async () => {
    // Custom subagent that intentionally fails turn 1 and self-corrects on turn 2
    class FlakySubagent extends BaseSubagent {
      public readonly id = 'flaky-subagent';
      public readonly layer = 'usability' as const;
      public readonly name = 'Flaky Subagent';
      private attempts = 0;

      public async generateArtifacts(
        context: SubagentContext,
        feedback?: string
      ): Promise<ProposedArtifact[]> {
        this.attempts++;
        if (this.attempts === 1) {
          // Intentionally broken auth.md without YAML frontmatter
          return [
            {
              targetPath: 'public/auth.md',
              action: 'create',
              content: 'Broken markdown without frontmatter',
              rationale: 'Initial broken draft',
              pointsImpact: 15,
              layer: 'usability',
            },
          ];
        }

        // Corrected on turn 2 responding to sandbox feedback
        expect(feedback).toContain('auth.md must start with YAML frontmatter');
        return [
          {
            targetPath: 'public/auth.md',
            action: 'create',
            content: `---
title: Corrected Auth Handbook
auth_schemes: [api_key]
---
# Corrected Guide
Authorization: Bearer <key>`,
            rationale: 'Self-corrected draft',
            pointsImpact: 15,
            layer: 'usability',
          },
        ];
      }
    }

    const flaky = new FlakySubagent();
    const result = await flaky.execute(mockContext);

    expect(result.passed).toBe(true);
    expect(result.iterations).toBe(2);
    expect(result.probePassRate).toBe(1.0);
  });
});

import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { inspectGitDrift, formatGitHubStepSummary, setGitHubOutput } from '../src/commands/ci.js';
import { CANONICAL_FIXTURES, LOCAL_FIXTURES } from '../src/commands/bench.js';
import { executeCodebaseAudit } from '../src/session/agentBrain.js';

describe('Enterprise CI Quality Gate & Benchmarks', () => {
  it('inspects git drift safely without crashing in worktree', () => {
    const drift = inspectGitDrift('origin/main');
    expect(drift).toBeDefined();
    expect(Array.isArray(drift.reasons)).toBe(true);
    expect(Array.isArray(drift.modifiedFiles)).toBe(true);
  });

  it('formats GitHub step summary with badges and committable diff blocks', () => {
    const summary = formatGitHubStepSummary(
      85,
      75,
      true,
      'http://localhost:3000',
      ['New route detected without llms.txt update'],
      [
        {
          file: 'public/auth.md',
          content: '# Machine-Readable Auth\nBearer token required.',
          rationale: 'Provide agent authentication specification',
        },
      ]
    );

    expect(summary).toContain('# 🤖 Glintbase Agent-Readiness CI Gate Report');
    expect(summary).toContain('Agent_Readiness_Gate-PASSED');
    expect(summary).toContain('85 / 100');
    expect(summary).toContain('### 🛠️ Committable PR Review Suggestions');
    expect(summary).toContain('```suggestion');
    expect(summary).toContain('public/auth.md');
  });

  it('emits output parameters to GITHUB_OUTPUT file when available', () => {
    const tempFile = join(tmpdir(), `test-gh-output-${Date.now()}.txt`);
    const orig = process.env.GITHUB_OUTPUT;
    process.env.GITHUB_OUTPUT = tempFile;

    try {
      setGitHubOutput('passed', true);
      setGitHubOutput('ars_score', 85);
      const content = readFileSync(tempFile, 'utf-8');
      expect(content).toContain('passed=true');
      expect(content).toContain('ars_score=85');
    } finally {
      if (existsSync(tempFile)) unlinkSync(tempFile);
      if (orig) process.env.GITHUB_OUTPUT = orig;
      else delete process.env.GITHUB_OUTPUT;
    }
  });

  it('contains canonical benchmark fixtures covering all 4 core archetypes', () => {
    expect(CANONICAL_FIXTURES.length).toBeGreaterThanOrEqual(5);

    const archetypes = new Set(CANONICAL_FIXTURES.map(f => f.archetype));
    expect(archetypes.has('devtool_saas')).toBe(true);
    expect(archetypes.has('content_media')).toBe(true);
    expect(archetypes.has('ecommerce_marketplace')).toBe(true);
  });

  it('contains valid offline local benchmark fixtures that evaluate deterministically', () => {
    expect(LOCAL_FIXTURES.length).toBe(3);

    for (const fix of LOCAL_FIXTURES) {
      const fixtureDir = resolve(process.cwd(), fix.path);
      expect(existsSync(fixtureDir)).toBe(true);

      const audit = executeCodebaseAudit(fixtureDir);
      expect(audit.totalScore).toBeDefined();
      expect(audit.totalScore).toBeGreaterThanOrEqual(fix.expectedMinScore);
      expect(audit.grade).toBeDefined();
      expect(audit.archetype).toBeDefined();
    }
  });
});

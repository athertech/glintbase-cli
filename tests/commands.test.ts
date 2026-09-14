import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { initCommand } from '../src/commands/init.js';
import { doctorCommand } from '../src/commands/doctor.js';
import { generateCommand } from '../src/commands/remediate.js';
import { auditCommand } from '../src/commands/audit.js';
import { fixCommand } from '../src/commands/fix.js';
import { ciCommand, formatGitHubStepSummary } from '../src/commands/ci.js';

describe('CLI Commands: init, doctor, generate, and audit', () => {
  const testWorkspace = join(process.cwd(), 'tests', 'fixtures', 'test-commands-workspace');
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    if (existsSync(testWorkspace)) {
      rmSync(testWorkspace, { recursive: true, force: true });
    }
    mkdirSync(testWorkspace, { recursive: true });
    writeFileSync(
      join(testWorkspace, 'package.json'),
      JSON.stringify({ name: 'test-commands-app', dependencies: { express: '^4.18.2' } }, null, 2)
    );
    process.chdir(testWorkspace);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testWorkspace)) {
      rmSync(testWorkspace, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('glintbase init', () => {
    it('initializes agent readiness and provisions .well-known/ard.json and robots.txt', async () => {
      let loggedOutput = '';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
        loggedOutput += msg + '\n';
      });

      await initCommand.parseAsync(['node', 'test', '--yes']);

      expect(existsSync(join(testWorkspace, '.well-known', 'ard.json'))).toBe(true);
      expect(existsSync(join(testWorkspace, 'robots.txt'))).toBe(true);
      expect(loggedOutput).toContain('Glintbase Agent Readiness Initialized');
      expect(loggedOutput).toContain('.well-known/ard.json');
    });

    it('outputs JSON format when --json is passed', async () => {
      let jsonOutput = '';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
        jsonOutput = msg;
      });

      await initCommand.parseAsync(['node', 'test', '--json']);

      const parsed = JSON.parse(jsonOutput);
      expect(parsed.initialized).toBe(true);
      expect(parsed.framework).toBe('Express.js');
      expect(parsed.createdFiles).toContain('.well-known/ard.json');
    });
  });

  describe('glintbase doctor', () => {
    it('diagnoses environment and agent surfaces in JSON format', async () => {
      let jsonOutput = '';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
        jsonOutput = msg;
      });

      await doctorCommand.parseAsync(['node', 'test', '--json']);

      const parsed = JSON.parse(jsonOutput);
      expect(parsed).toHaveProperty('environment');
      expect(parsed.environment.nodePassed).toBe(true);
      expect(parsed).toHaveProperty('workspace');
      expect(parsed.workspace.framework).toBe('Express.js');
      expect(parsed).toHaveProperty('agentSurfaces');
      expect(parsed.agentSurfaces).toHaveProperty('robotsTxt');
      expect(parsed.agentSurfaces).toHaveProperty('missingGapsCount');
    });

    it('prints human-readable diagnostic report with status marks', async () => {
      let loggedOutput = '';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
        loggedOutput += msg + '\n';
      });

      await doctorCommand.parseAsync(['node', 'test']);

      expect(loggedOutput).toContain('Glintbase System & Readiness Doctor');
      expect(loggedOutput).toContain('Runtime Environment:');
      expect(loggedOutput).toContain('Workspace Architecture:');
      expect(loggedOutput).toContain('Agent Manifest Surfaces:');
    });
  });

  describe('glintbase generate (remediate)', () => {
    it('generates specific artifact like robots.txt', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await generateCommand.parseAsync(['node', 'test', 'robots.txt', '--force']);

      expect(existsSync(join(testWorkspace, 'robots.txt'))).toBe(true);
      const content = readFileSync(join(testWorkspace, 'robots.txt'), 'utf-8');
      expect(content).toContain('User-agent: ClaudeBot');
      expect(content).toContain('User-agent: GPTBot');
    });

    it('generates auth.md handbook', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await generateCommand.parseAsync(['node', 'test', 'auth.md', '--force']);

      expect(existsSync(join(testWorkspace, 'auth.md'))).toBe(true);
      const content = readFileSync(join(testWorkspace, 'auth.md'), 'utf-8');
      expect(content).toContain('Authentication Guide');
    });

    it('generates openapi.json specification', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await generateCommand.parseAsync(['node', 'test', 'openapi.json', '--force']);

      expect(existsSync(join(testWorkspace, 'openapi.json'))).toBe(true);
      const content = JSON.parse(readFileSync(join(testWorkspace, 'openapi.json'), 'utf-8'));
      expect(content.openapi).toBe('3.1.0');
      expect(content.paths).toBeDefined();
    });

    it('generates .well-known/ai-catalog.json', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await generateCommand.parseAsync(['node', 'test', 'ai-catalog.json', '--force']);

      expect(existsSync(join(testWorkspace, '.well-known', 'ai-catalog.json'))).toBe(true);
      const content = JSON.parse(readFileSync(join(testWorkspace, '.well-known', 'ai-catalog.json'), 'utf-8'));
      expect(content.$schema).toContain('agent-card.org');
    });
  });

  describe('glintbase audit --format and --report', () => {
    it('outputs markdown format directly to stdout when --format markdown is passed', async () => {
      let loggedOutput = '';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
        loggedOutput += msg + '\n';
      });

      await auditCommand.parseAsync(['node', 'test', '.', '--format', 'markdown']);

      expect(loggedOutput).toContain('# Glintbase Agent Readiness Report (ARS 3.0)');
      expect(loggedOutput).toContain('Executive Summary & Scorecard');
      expect(loggedOutput).toContain('Layer-by-Layer Health Breakdown');
      expect(loggedOutput).toContain('Layer 1: Discovery');
      expect(loggedOutput).toContain('Actionable Remediations');
    });

    it('outputs JSON scorecard when --format json is passed', async () => {
      let jsonOutput = '';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
        jsonOutput = msg;
      });

      await auditCommand.parseAsync(['node', 'test', '.', '--format', 'json']);

      const parsed = JSON.parse(jsonOutput);
      expect(parsed).toHaveProperty('score');
      expect(parsed).toHaveProperty('archetype');
      expect(parsed).toHaveProperty('layers');
      expect(parsed.layers).toHaveProperty('discovery');
    });

    it('generates a comprehensive markdown report file when --report is passed', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const reportFile = join(testWorkspace, 'custom-report.md');

      await auditCommand.parseAsync(['node', 'test', '.', '--report', reportFile]);

      expect(existsSync(reportFile)).toBe(true);
      const content = readFileSync(reportFile, 'utf-8');
      expect(content).toContain('# Glintbase Agent Readiness Report (ARS 3.0)');
      expect(content).toContain('Executive Summary & Scorecard');
      expect(content).toContain('Layer 1: Discovery');
    });
  });

  describe('glintbase fix --branch', () => {
    it('creates a git branch and commits remediations when --branch is passed', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});

      // Initialize git in testWorkspace
      execSync('git init -b main', { cwd: testWorkspace, stdio: 'ignore' });
      execSync('git config user.email "test@glintbase.com"', { cwd: testWorkspace, stdio: 'ignore' });
      execSync('git config user.name "Glintbase Bot"', { cwd: testWorkspace, stdio: 'ignore' });
      execSync('git add -A', { cwd: testWorkspace, stdio: 'ignore' });
      execSync('git commit -m "initial commit"', { cwd: testWorkspace, stdio: 'ignore' });

      await fixCommand.parseAsync(['node', 'test', '.', '--branch', 'glintbase/agent-pr', '--yes']);

      const currentBranch = execSync('git branch --show-current', { cwd: testWorkspace, encoding: 'utf-8' }).trim();
      expect(currentBranch).toBe('glintbase/agent-pr');
      expect(existsSync(join(testWorkspace, 'robots.txt'))).toBe(true);

      const log = execSync('git log -n 1 --oneline', { cwd: testWorkspace, encoding: 'utf-8' });
      expect(log).toContain('autonomous ARS 3.0 remediation');
    });
  });

  describe('glintbase ci', () => {
    it('formats ARS 3.0 GitHub Step Summary with layer breakdown and suggestions', () => {
      const summary = formatGitHubStepSummary({
        score: 82,
        failUnder: 75,
        passed: true,
        target: 'test-app',
        archetype: 'Developer Platform & API',
        grade: 'A-',
        layers: [
          { name: 'Layer 1: Discovery', score: 18, maxScore: 20, statusText: 'Optimal' },
          { name: 'Layer 2: Access & Understanding', score: 28, maxScore: 30, statusText: 'Optimal' },
        ],
        remediations: [
          { file: 'robots.txt', content: 'User-agent: ClaudeBot\nAllow: /', rationale: 'Permit AI agents' }
        ],
      });

      expect(summary).toContain('# 🤖 Glintbase Agent-Readiness CI Gate Report (ARS 3.0)');
      expect(summary).toContain('82 / 100');
      expect(summary).toContain('Layer 1: Discovery');
      expect(summary).toContain('Committable PR Review Suggestions');
      expect(summary).toContain('```suggestion');
    });
  });
});

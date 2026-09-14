import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  inspectWorkspaceGaps,
  processSessionQuery,
  executeAuthenticFix,
  executeCodebaseAudit,
  executeAuthenticAudit,
  cleanThinkingTags,
  executeRouteScan,
} from '../src/session/agentBrain.js';
import { getEffectiveModelInfo, loadConfig, saveConfig, resetConfig } from '../src/config.js';
import { parseModelTarget } from '../src/commands/model.js';
import {
  parseUserIntent,
  stripConversationalWrappers,
  isCurrentWorkspaceReference,
  extractAndValidateTarget,
} from '../src/session/intentAnalyzer.js';
import { runReActAgent } from '../src/harness/reactAgent.js';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

describe('Autonomous ReAct Agent & Deterministic Engine', () => {
  const testWorkspace = join(process.cwd(), 'tests', 'fixtures', 'test-react-agent-workspace');

  beforeEach(() => {
    if (existsSync(testWorkspace)) {
      rmSync(testWorkspace, { recursive: true, force: true });
    }
    mkdirSync(testWorkspace, { recursive: true });
    writeFileSync(
      join(testWorkspace, 'package.json'),
      JSON.stringify({ name: 'react-agent-test', dependencies: { express: '^4.18.2' } }, null, 2)
    );
  });

  afterEach(() => {
    if (existsSync(testWorkspace)) {
      rmSync(testWorkspace, { recursive: true, force: true });
    }
  });

  it('runs deterministic AST remediation loop when no LLM provider is configured', async () => {
    const result = await runReActAgent({
      cwd: testWorkspace,
      provider: null,
      quiet: true,
    });

    expect(result.success).toBe(true);
    expect(result.mode).toBe('deterministic');
    expect(result.artifactsApplied.length).toBeGreaterThanOrEqual(3);
    expect(result.toolsCalled).toContain('detect_framework');
    expect(result.toolsCalled).toContain('apply_remediation');

    // Verify files were actually written to disk
    expect(existsSync(join(testWorkspace, 'robots.txt'))).toBe(true);
    expect(existsSync(join(testWorkspace, 'llms.txt'))).toBe(true);
    expect(existsSync(join(testWorkspace, 'auth.md'))).toBe(true);
    expect(existsSync(join(testWorkspace, '.well-known', 'ard.json'))).toBe(true);
  });

  it('captures linear step logs via onLog callback', async () => {
    const logs: string[] = [];
    await runReActAgent({
      cwd: testWorkspace,
      provider: null,
      onLog: (msg) => logs.push(msg),
    });

    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some(l => l.includes('Deterministic AST Engine') || l.includes('Generated'))).toBe(true);
  });

  it('returns clean serializable JSON result when json option is true', async () => {
    const result = await runReActAgent({
      cwd: testWorkspace,
      provider: null,
      json: true,
    });

    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('mode', 'deterministic');
    expect(result).toHaveProperty('finalScore');
    expect(result).toHaveProperty('artifactsApplied');
    expect(typeof result.finalScore).toBe('number');
  });
});

describe('Authentic Agent Brain & Doctor Execution', () => {
  const testWorkspace = join(process.cwd(), 'tests', 'fixtures', 'test-brain-workspace');
  let savedConfig: any;

  beforeEach(() => {
    savedConfig = loadConfig();
    resetConfig();
    if (existsSync(testWorkspace)) {
      rmSync(testWorkspace, { recursive: true, force: true });
    }
    mkdirSync(testWorkspace, { recursive: true });
    writeFileSync(
      join(testWorkspace, 'package.json'),
      JSON.stringify({ name: 'sample-app', dependencies: { express: '^4.18.2' } }, null, 2)
    );
  });

  afterEach(() => {
    resetConfig();
    saveConfig(savedConfig);
    if (existsSync(testWorkspace)) {
      rmSync(testWorkspace, { recursive: true, force: true });
    }
  });

  it('inspects workspace gaps accurately on clean repository', () => {
    const gaps = inspectWorkspaceGaps(testWorkspace);
    expect(gaps.profile.name).toBe('Express.js');
    expect(gaps.hasRobots).toBe(false);
    expect(gaps.hasLlms).toBe(false);
    expect(gaps.hasAuth).toBe(false);
    expect(gaps.missingCount).toBeGreaterThanOrEqual(4);
  });

  it('processes greeting query with authentic AST status', async () => {
    const modelInfo = getEffectiveModelInfo({});
    const response = await processSessionQuery('hey', testWorkspace, modelInfo);

    expect(response.title).toContain('Thought');
    expect(response.content.some(l => l.includes('Express.js') || l.includes('Glintbase'))).toBe(true);
    expect(response.content.some(l => l.includes('Offline AST & Probes Engine'))).toBe(true);
    expect(response.badge).toContain('AST');
  });

  it('processes agent readiness inquiry with ARS 2.0 layer breakdown', async () => {
    const modelInfo = getEffectiveModelInfo({});
    const response = await processSessionQuery('u aware of agent readiness', testWorkspace, modelInfo);

    expect(response.title).toContain('Thought');
    expect(response.content.some(l => l.includes('ARS 2.0'))).toBe(true);
    expect(response.content.some(l => l.includes('Discovery (25 pts)'))).toBe(true);
    expect(response.content.some(l => l.includes('robots.txt'))).toBe(true);
  });

  it('executes authentic doctor fix: writes verified files and evaluates sandbox score', async () => {
    const fixResult = await executeAuthenticFix(testWorkspace);

    expect(fixResult.appliedCount).toBeGreaterThan(0);
    expect(fixResult.title).toContain('Remediation Doctor');
    expect(fixResult.content.some(l => l.includes('Sandbox Score Delta'))).toBe(true);

    // Verify files were actually written to disk
    expect(existsSync(join(testWorkspace, 'robots.txt'))).toBe(true);
    expect(existsSync(join(testWorkspace, 'auth.md'))).toBe(true);
    expect(existsSync(join(testWorkspace, 'llms.txt'))).toBe(true);
    expect(existsSync(join(testWorkspace, '.well-known', 'ard.json'))).toBe(true);

    // Re-inspect workspace: missing count must drop to 0!
    const rechecked = inspectWorkspaceGaps(testWorkspace);
    expect(rechecked.hasRobots).toBe(true);
    expect(rechecked.hasAuth).toBe(true);
    expect(rechecked.hasLlms).toBe(true);
    expect(rechecked.hasArd).toBe(true);
  });

  it('performs ultra-fast Codebase Audit without network calls (<150ms)', () => {
    const auditRes = executeCodebaseAudit(testWorkspace);

    expect(auditRes.title).toContain('ARS 2.0 Codebase Audit');
    expect(auditRes.durationMs).toBeLessThan(150);
    expect(auditRes.badge).toContain('[C] Codebase');
    expect(auditRes.content.some(l => l.includes('LAYER 1: Discovery'))).toBe(true);
    expect(auditRes.content.some(l => l.includes('LAYER 2: Access'))).toBe(true);
    expect(auditRes.content.some(l => l.includes('LAYER 3: Usability'))).toBe(true);
    expect(auditRes.content.some(l => l.includes('LAYER 4: Payments'))).toBe(true);
  });

  it('routes audit to Codebase mode when target is . or codebase', async () => {
    const defaultAudit = await executeAuthenticAudit('.', testWorkspace);
    expect(defaultAudit.title).toContain('ARS 2.0 Codebase Audit');

    const explicitAudit = await executeAuthenticAudit('codebase', testWorkspace);
    expect(explicitAudit.title).toContain('ARS 2.0 Codebase Audit');
  });

  it('routes audit to Site mode when target is an HTTP/HTTPS URL and reports probe results', async () => {
    const siteAudit = await executeAuthenticAudit('http://127.0.0.1:59998', testWorkspace);
    expect(siteAudit.title).toContain('ARS 2.0 Site Audit');
    expect(siteAudit.badge).toContain('[S] Site');
    expect(siteAudit.content.some(l => l.includes('LAYER 1: Discovery'))).toBe(true);
    expect(siteAudit.content.some(l => l.includes('remediation') || l.includes('/fix'))).toBe(true);
  });
});

describe('Model Identifier & Provider Target Parsing', () => {
  let savedConfig: any;

  beforeEach(() => {
    savedConfig = loadConfig();
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
    saveConfig(savedConfig);
  });

  it('correctly parses model targets with slashes (e.g. qwen/qwen3.6-27b)', () => {
    // 1. Model with slash under current provider (groq)
    const res1 = parseModelTarget('qwen/qwen3.6-27b', 'groq');
    expect(res1.provider).toBe('groq');
    expect(res1.model).toBe('qwen/qwen3.6-27b');

    // 2. Explicit provider prefix with colon or slash
    const res2 = parseModelTarget('groq/qwen/qwen3.6-27b');
    expect(res2.provider).toBe('groq');
    expect(res2.model).toBe('qwen/qwen3.6-27b');

    const res3 = parseModelTarget('groq:llama-3.3-70b-versatile');
    expect(res3.provider).toBe('groq');
    expect(res3.model).toBe('llama-3.3-70b-versatile');

    // 3. Known model heuristics
    const res4 = parseModelTarget('claude-3-7-sonnet-20250219');
    expect(res4.provider).toBe('anthropic');
    expect(res4.model).toBe('claude-3-7-sonnet-20250219');

    const res5 = parseModelTarget('gpt-4o');
    expect(res5.provider).toBe('openai');
    expect(res5.model).toBe('gpt-4o');

    // 4. Standalone provider name
    const res6 = parseModelTarget('groq');
    expect(res6.provider).toBe('groq');
    expect(res6.model).toBeNull();
  });

  it('correctly extracts and strips <think>...</think> tags from model outputs', () => {
    const rawWithThink = `<think>
1. Analyze user prompt: 'hi'
2. Formulate helpful greeting
</think>
Hello! How can I assist you today?`;

    const cleaned = cleanThinkingTags(rawWithThink);
    expect(cleaned.thinking).toContain('Analyze user prompt');
    expect(cleaned.text).toBe('Hello! How can I assist you today?');

    const rawWithoutThink = 'This is a direct response without thinking tags.';
    const directCleaned = cleanThinkingTags(rawWithoutThink);
    expect(directCleaned.thinking).toBeUndefined();
    expect(directCleaned.text).toBe(rawWithoutThink);
  });

  it('scans routes and returns structured telemetry via executeRouteScan', () => {
    const result = executeRouteScan(process.cwd());
    expect(result).toBeDefined();
    expect(result.title).toContain('Route Scanner');
    expect(result.badge).toContain('AST');
  });
});

describe('Natural Language Intent & Path Analyzer', () => {
  it('strips conversational polite wrappers accurately', () => {
    expect(stripConversationalWrappers('can you please analyse this codebase')).toBe('analyse this codebase');
    expect(stripConversationalWrappers('could you please audit this project?')).toBe('audit this project');
    expect(stripConversationalWrappers('i want you to check this repo, please')).toBe('check this repo');
    expect(stripConversationalWrappers('please show routes')).toBe('show routes');
  });

  it('identifies relative and demonstrative workspace tokens as current workspace (.)', () => {
    expect(isCurrentWorkspaceReference('this codebase')).toBe(true);
    expect(isCurrentWorkspaceReference('the codebase')).toBe(true);
    expect(isCurrentWorkspaceReference('this project')).toBe(true);
    expect(isCurrentWorkspaceReference('this repo')).toBe(true);
    expect(isCurrentWorkspaceReference('current workspace')).toBe(true);
    expect(isCurrentWorkspaceReference('here')).toBe(true);
    expect(isCurrentWorkspaceReference('.')).toBe(true);
    expect(isCurrentWorkspaceReference('some/random/dir')).toBe(false);
  });

  it('parses "analyse this codebase" and "audit this codebase" (both UK and US spellings)', () => {
    const intentUk = parseUserIntent('analyse this codebase', process.cwd());
    expect(intentUk.type).toBe('audit');
    expect(intentUk.target).toBe('.');
    expect(intentUk.pathExists).toBe(true);
    expect(intentUk.resolvedPath).toBe(process.cwd());

    const intentUs = parseUserIntent('analyze this codebase', process.cwd());
    expect(intentUs.type).toBe('audit');
    expect(intentUs.target).toBe('.');
    expect(intentUs.pathExists).toBe(true);

    const intentAudit = parseUserIntent('audit this codebase', process.cwd());
    expect(intentAudit.type).toBe('audit');
    expect(intentAudit.target).toBe('.');
    expect(intentAudit.pathExists).toBe(true);

    const intentConversational = parseUserIntent('can you please analyse this project?', process.cwd());
    expect(intentConversational.type).toBe('audit');
    expect(intentConversational.target).toBe('.');
    expect(intentConversational.pathExists).toBe(true);
  });

  it('detects and flags non-existent target paths with pathExists: false', () => {
    const intentInvalid = parseUserIntent('audit ./nonexistent_subfolder_xyz_999', process.cwd());
    expect(intentInvalid.type).toBe('audit');
    expect(intentInvalid.pathExists).toBe(false);
    expect(intentInvalid.invalidPathReason).toBeDefined();
  });

  it('recognizes conversational and explicit help handbook queries', () => {
    expect(parseUserIntent('what can you do?', process.cwd()).type).toBe('help');
    expect(parseUserIntent('how do i use this tool', process.cwd()).type).toBe('help');
    expect(parseUserIntent('available commands', process.cwd()).type).toBe('help');
    expect(parseUserIntent('/help', process.cwd()).type).toBe('help');
    expect(parseUserIntent('help', process.cwd()).type).toBe('help');
  });
});

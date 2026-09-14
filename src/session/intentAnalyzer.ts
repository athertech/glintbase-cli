/**
 * Natural Language Intent & Path Analyzer for Glintbase CLI.
 * Enables the CLI to interpret human language commands (e.g. "analyse this codebase",
 * "audit this project", "remediate agent gaps", "show routes"), extract target paths,
 * validate directories, and provide rich capability handbooks when paths do not correlate.
 */

import { existsSync, statSync } from 'fs';
import { resolve, join, isAbsolute } from 'path';
import pc from 'picocolors';
import { brand } from '../output/banner.js';
import type { EffectiveModelInfo } from '../config.js';
import type { BrainResponse } from './agentBrain.js';

export type RecognizedIntentType =
  | 'audit'
  | 'fix'
  | 'routes'
  | 'ci'
  | 'bench'
  | 'connect'
  | 'model'
  | 'key'
  | 'config'
  | 'help'
  | 'clear'
  | 'exit'
  | 'general_query';

export interface AnalyzedIntent {
  type: RecognizedIntentType;
  raw: string;
  cleanQuery: string;
  target?: string;
  resolvedPath?: string;
  isUrl?: boolean;
  pathExists?: boolean;
  invalidPathReason?: string;
  args?: Record<string, string>;
}

/**
 * Remove conversational wrapper phrases from user input.
 * e.g. "can you please analyse this codebase" -> "analyse this codebase"
 */
export function stripConversationalWrappers(input: string): string {
  let cleaned = input.trim();

  // Strip leading punctuation
  cleaned = cleaned.replace(/^[!?.,;:]+/, '').trim();

  // Strip common conversational openings
  const openings = [
    /^(can\s+you\s+please\s+)/i,
    /^(could\s+you\s+please\s+)/i,
    /^(would\s+you\s+please\s+)/i,
    /^(can\s+you\s+)/i,
    /^(could\s+you\s+)/i,
    /^(would\s+you\s+)/i,
    /^(please\s+)/i,
    /^(pls\s+)/i,
    /^(i\s+want\s+you\s+to\s+)/i,
    /^(i\s+want\s+to\s+)/i,
    /^(i\s+need\s+you\s+to\s+)/i,
    /^(i\s+need\s+to\s+)/i,
    /^(let'?s\s+)/i,
    /^(let\s+us\s+)/i,
    /^(help\s+me\s+)/i,
    /^(go\s+ahead\s+and\s+)/i,
  ];

  for (const regex of openings) {
    if (regex.test(cleaned)) {
      cleaned = cleaned.replace(regex, '').trim();
    }
  }

  // Strip trailing polite marks
  cleaned = cleaned.replace(/[,.]*\s*(please|pls)\s*[!?.]*$/i, '').trim();
  cleaned = cleaned.replace(/[!?.]+$/, '').trim();

  return cleaned;
}

/**
 * Check whether a target string refers to the current working workspace.
 */
export function isCurrentWorkspaceReference(target: string): boolean {
  const lower = target.toLowerCase().trim();
  const currentTokens = [
    '.',
    './',
    'here',
    'this',
    'codebase',
    'this codebase',
    'the codebase',
    'my codebase',
    'our codebase',
    'project',
    'this project',
    'the project',
    'my project',
    'our project',
    'repo',
    'this repo',
    'the repo',
    'my repo',
    'repository',
    'this repository',
    'the repository',
    'app',
    'this app',
    'the app',
    'application',
    'workspace',
    'this workspace',
    'the workspace',
    'current workspace',
    'current directory',
    'current dir',
  ];
  return currentTokens.includes(lower);
}

/**
 * Extract and validate a path or URL from user input.
 */
export function extractAndValidateTarget(rawTarget: string, cwd: string): {
  target: string;
  resolvedPath?: string;
  isUrl: boolean;
  pathExists: boolean;
  invalidPathReason?: string;
} {
  const clean = rawTarget.trim().replace(/^["']|["']$/g, '');

  // 1. If empty or references current workspace
  if (!clean || isCurrentWorkspaceReference(clean)) {
    return {
      target: '.',
      resolvedPath: cwd,
      isUrl: false,
      pathExists: true,
    };
  }

  // 2. If it's a URL
  if (/^https?:\/\//i.test(clean)) {
    return {
      target: clean,
      isUrl: true,
      pathExists: true,
    };
  }

  // 3. Filesystem path (absolute or relative)
  const resolved = isAbsolute(clean) ? resolve(clean) : resolve(cwd, clean);

  if (existsSync(resolved)) {
    try {
      const stat = statSync(resolved);
      return {
        target: clean,
        resolvedPath: resolved,
        isUrl: false,
        pathExists: true,
      };
    } catch {
      return {
        target: clean,
        resolvedPath: resolved,
        isUrl: false,
        pathExists: false,
        invalidPathReason: `Path "${clean}" could not be accessed.`,
      };
    }
  }

  return {
    target: clean,
    resolvedPath: resolved,
    isUrl: false,
    pathExists: false,
    invalidPathReason: `Directory or path "${clean}" does not exist.`,
  };
}

/**
 * Parse and classify human natural language query into a structured Intent.
 */
export function parseUserIntent(rawInput: string, cwd: string): AnalyzedIntent {
  const raw = rawInput.trim();
  const cleaned = stripConversationalWrappers(raw);
  const lower = cleaned.toLowerCase();

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Exit / Quit
  // ──────────────────────────────────────────────────────────────────────────
  if (/^(\/exit|\/quit|exit|quit|q)$/i.test(cleaned)) {
    return { type: 'exit', raw, cleanQuery: cleaned };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Clear Screen
  // ──────────────────────────────────────────────────────────────────────────
  if (/^(\/clear|clear|reset)$/i.test(cleaned)) {
    return { type: 'clear', raw, cleanQuery: cleaned };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Help Handbook Intent
  // ──────────────────────────────────────────────────────────────────────────
  const isHelpExplicit = /^(\/help|\/h|help|\?|h)$/i.test(cleaned);
  const isHelpConversational = /^(what\s+can\s+(you|this\s+cli|glintbase)\s+do|how\s+(do\s+i|to)\s+use\s+((this|the)\s+(cli|tool|glintbase|harness|app)|glintbase)|show\s+commands|list\s+commands|available\s+commands|commands\b|options\b|capabilities\b)/i.test(lower);

  if (isHelpExplicit || isHelpConversational) {
    return { type: 'help', raw, cleanQuery: cleaned };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Routes Scanning Intent
  // ──────────────────────────────────────────────────────────────────────────
  const isRoutesCommand = /^(\/routes|\/rt\b|routes\b|rt\b)/i.test(cleaned);
  const isRoutesConversational = /^(scan\s+routes|show\s+routes|list\s+routes|find\s+routes|endpoints\b|api\s+routes|api\s+endpoints|what\s+are\s+the\s+routes|show\s+me\s+the\s+routes|show\s+endpoints)\b/i.test(lower);

  if (isRoutesCommand || isRoutesConversational) {
    const targetMatch = cleaned.replace(/^(\/routes|\/rt\b|routes\b|rt\b|scan\s+routes|show\s+routes|list\s+routes|find\s+routes|endpoints|api\s+routes|api\s+endpoints|what\s+are\s+the\s+routes|show\s+me\s+the\s+routes|show\s+endpoints)\b\s*(for|in|on)?\s*/i, '').trim();
    const targetInfo = extractAndValidateTarget(targetMatch, cwd);
    return {
      type: 'routes',
      raw,
      cleanQuery: cleaned,
      ...targetInfo,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. CI Drift Gate Intent
  // ──────────────────────────────────────────────────────────────────────────
  const isCiCommand = /^(\/ci|ci\b)/i.test(cleaned);
  const isCiConversational = /^(ci\s+gate|check\s+pr\s+drift|check\s+drift|pr\s+drift|inspect\s+drift|run\s+ci|test\s+pr)\b/i.test(lower);

  if (isCiCommand || isCiConversational) {
    return { type: 'ci', raw, cleanQuery: cleaned };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Bench Intent
  // ──────────────────────────────────────────────────────────────────────────
  const isBenchCommand = /^(\/bench|bench\b)/i.test(cleaned);
  const isBenchConversational = /^(benchmark|run\s+benchmark|run\s+bench|arb\b|agent\s+readiness\s+benchmark)\b/i.test(lower);

  if (isBenchCommand || isBenchConversational) {
    return { type: 'bench', raw, cleanQuery: cleaned };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Fix / Remediate Intent
  // ──────────────────────────────────────────────────────────────────────────
  const isFixCommand = /^(\/fix|\/remediate|\/f\b|fix\b|remediate\b|f\b)/i.test(cleaned);
  const isFixConversational = /^(fix|remediate|repair|patch|doctor|generate\s+artifacts|apply\s+fixes|remedy|resolve\s+gaps)\b/i.test(lower);

  if (isFixCommand || isFixConversational) {
    const targetMatch = cleaned.replace(/^(\/fix|\/remediate|\/f\b|fix\b|remediate\b|repair\b|patch\b|doctor\b|generate\s+artifacts\b|apply\s+fixes\b|remedy\b|resolve\s+gaps\b|f\b)\s*(agent\s+gaps|gaps|for|in|on)?\s*/i, '').trim();
    const targetInfo = extractAndValidateTarget(targetMatch, cwd);
    return {
      type: 'fix',
      raw,
      cleanQuery: cleaned,
      ...targetInfo,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Audit / Analyse Intent
  // ──────────────────────────────────────────────────────────────────────────
  const isAuditCommand = /^(\/audit|\/a\b|audit\b|a\b)/i.test(cleaned);
  const isAuditConversational = /^(analyse|analyze|audit|inspect|examine|evaluate|assess|scan)\b/i.test(lower);

  if (isAuditCommand || isAuditConversational) {
    // Extract target after verb and prepositions with strict word boundaries
    let targetMatch = cleaned.replace(/^(\/audit|\/a\b|audit\b|analyse\b|analyze\b|inspect\b|examine\b|evaluate\b|assess\b|scan\b|a\b)\s*(the\s+agent\s+readiness\s+of|agent\s+readiness\s+of|readiness\s+of|the|for|in|on)?\s*/i, '').trim();

    // Check if target was wrapped in quotes
    const quoteMatch = targetMatch.match(/^["']([^"']+)["']/);
    if (quoteMatch) {
      targetMatch = quoteMatch[1];
    }

    const targetInfo = extractAndValidateTarget(targetMatch, cwd);
    return {
      type: 'audit',
      raw,
      cleanQuery: cleaned,
      ...targetInfo,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 9. Connect / Key / Model Intents
  // ──────────────────────────────────────────────────────────────────────────
  if (/^(\/connect|connect)\b/i.test(cleaned)) {
    return { type: 'connect', raw, cleanQuery: cleaned };
  }

  if (/^(\/key|key)\b/i.test(cleaned)) {
    return { type: 'key', raw, cleanQuery: cleaned };
  }

  if (/^(\/model|model)\b/i.test(cleaned)) {
    return { type: 'model', raw, cleanQuery: cleaned };
  }

  if (/^(\/config|config)\b/i.test(cleaned)) {
    return { type: 'config', raw, cleanQuery: cleaned };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 10. General Conversational Query
  // ──────────────────────────────────────────────────────────────────────────
  return {
    type: 'general_query',
    raw,
    cleanQuery: cleaned,
  };
}

/**
 * Render a helpful error response when the target path does not exist or cannot be correlated.
 */
export function renderPathNotFoundError(
  target: string,
  cwd: string,
  modelInfo: EffectiveModelInfo
): BrainResponse {
  return {
    title: `Target Path Not Found · "${target}"`,
    content: [
      pc.red(`✗ Could not locate directory or file: "${target}"`),
      pc.dim(`  Searched relative to current workspace: ${cwd}`),
      '',
      pc.bold('How to specify a valid target for audit or analysis:'),
      `  • Current Codebase : ${brand.orangeBold('"analyse this codebase"')} or ${brand.orangeBold('/audit .')}`,
      `  • Relative Path    : ${brand.orangeBold('audit ../my-other-project')} or ${brand.orangeBold('analyse ./packages/web')}`,
      `  • Absolute Path    : ${brand.orangeBold('audit /Users/USER/Desktop/my-project')}`,
      `  • Live Site (URL)  : ${brand.orangeBold('audit https://my-product.com')}`,
      '',
      pc.bold('Available Things You Can Do with Glintbase:'),
      `  • ${brand.orangeBold('analyse / audit')}   Evaluate 4-layer ARS 2.0 readiness (Discovery, Access, Usability, Payments)`,
      `  • ${brand.orangeBold('fix / remediate')}   Diagnose & generate verified specs (llms.txt, auth.md, ard.json, mcp)`,
      `  • ${brand.orangeBold('routes')}            Scan & list all API routes, HTTP methods, and endpoint handlers`,
      `  • ${brand.orangeBold('ci')}                Run CI PR drift gate comparing git branch against origin/main`,
      `  • ${brand.orangeBold('bench')}             Run Agent Readiness Benchmark (ARB) evaluation suite`,
      `  • ${brand.orangeBold('connect')}           Connect AI model provider (Groq, Anthropic, OpenAI, Ollama)`,
      `  • ${brand.orangeBold('model')}             Inspect or switch active model (e.g. qwen/qwen3.6-27b)`,
      `  • ${brand.orangeBold('help')}              View complete handbook, slash commands, and natural language guide`,
    ],
    durationMs: 4,
    badge: `[!] Path Not Found`,
  };
}

/**
 * Render the comprehensive Glintbase capability handbook.
 */
export function renderHelpHandbook(
  cwd: string,
  modelInfo: EffectiveModelInfo
): BrainResponse {
  return {
    title: 'Handbook · Glintbase Agent Harness (ARS 2.0)',
    content: [
      pc.bold('Natural Language Commands (Just Type Plain English):'),
      `  • ${brand.orangeBold('"analyse this codebase"')} or ${brand.orangeBold('"audit this project"')}`,
      `      Run full 4-layer ARS 2.0 agent readiness audit on the active workspace`,
      `  • ${brand.orangeBold('"audit https://example.com"')}`,
      `      Run live remote probes against a deployed endpoint or web application`,
      `  • ${brand.orangeBold('"fix agent gaps"')} or ${brand.orangeBold('"remediate this codebase"')}`,
      `      Autonomously diagnose and generate living artifacts (llms.txt, auth.md, ard.json)`,
      `  • ${brand.orangeBold('"routes"')} or ${brand.orangeBold('"scan routes in this project"')}`,
      `      Discover all API endpoints, HTTP methods, and route handler signatures`,
      `  • ${brand.orangeBold('"ci"')} or ${brand.orangeBold('"check pr drift"')}`,
      `      Run enterprise CI quality gate comparing branch drift against origin/main`,
      `  • ${brand.orangeBold('"bench"')} or ${brand.orangeBold('"run benchmark"')}`,
      `      Evaluate against the Agent Readiness Benchmark (ARB) test suite`,
      '',
      pc.bold('Slash Commands:'),
      `  • ${brand.orangeBold('/audit')} [path|url]     Audit codebase directory or live URL`,
      `  • ${brand.orangeBold('/fix')} [target]         Autonomous doctor: remediate agent gaps`,
      `  • ${brand.orangeBold('/remediate')} [art]      Generate specific living agent artifacts`,
      `  • ${brand.orangeBold('/routes')}               Scan & list all API endpoints in codebase`,
      `  • ${brand.orangeBold('/check')} <url> [ids]    Targeted verification of specific probe IDs`,
      `  • ${brand.orangeBold('/ci')} [--fail-under]   Enterprise CI quality gate & drift detector`,
      `  • ${brand.orangeBold('/bench')} [--suite]     Run Agent Readiness Benchmark test suite`,
      `  • ${brand.orangeBold('/connect')} [p] [k] [m]  Interactive AI model connection modal`,
      `  • ${brand.orangeBold('/key')} <apiKey>        Update API key for active provider`,
      `  • ${brand.orangeBold('/model')} [target]      Inspect or switch model (supports slashes)`,
      `  • ${brand.orangeBold('/config')}              View or set API keys and scanner settings`,
      `  • ${brand.orangeBold('/clear')}               Clear conversation screen`,
      `  • ${brand.orangeBold('/exit')}                Exit Glintbase CLI session`,
      '',
      pc.bold('Active Environment:'),
      `  • Current Workspace : ${pc.dim(cwd)}`,
      `  • Active AI Model   : ${modelInfo.isConfigured ? pc.cyan(`${modelInfo.model} (${modelInfo.provider})`) : pc.yellow('Offline AST & Probes Engine')}`,
    ],
    durationMs: 4,
    badge: 'Harness · Built-in Handbook',
  };
}

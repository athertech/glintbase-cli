/**
 * Interactive Prompt Box with Slash Command Autocomplete for Glintbase.
 * Implements OpenCode / Claude Code / Pi style inline command console:
 * Centered layout, sleek prompt card with left accent indicator, attached
 * popup menu rendered above the input card with solid peach/orange highlight,
 * and flicker-free in-place terminal cursor rewriting with line-clearing.
 */

import pc from 'picocolors';
import readline from 'readline';
import { brand, stripAnsi, GLINTBASE_WORDMARK } from './banner.js';
import { getEffectiveModelInfo, EffectiveModelInfo } from '../config.js';
import { detectFramework } from '../ast/frameworkDetector.js';

export interface SlashCommand {
  name: string;
  alias?: string;
  description: string;
  args?: string;
}

export const BUILTIN_SLASH_COMMANDS: SlashCommand[] = [
  { name: 'audit', alias: 'a', description: 'Run full ARS 2.0 autonomous agent readiness audit', args: '[url]' },
  { name: 'fix', alias: 'f', description: 'Autonomous doctor: diagnose & remediate agent gaps', args: '[target]' },
  { name: 'doctor', alias: 'd', description: 'Comprehensive system health check and agent surface diagnostics', args: '' },
  { name: 'init', alias: 'i', description: 'Initialize agent resource discovery and standard specifications', args: '' },
  { name: 'generate', alias: 'g', description: 'Generate living agent specifications (robots, llms, mcp, auth)', args: '<spec>' },
  { name: 'remediate', alias: 'r', description: 'Generate living agent artifacts (llms.txt, auth.md, mcp)', args: '[art]' },
  { name: 'check', alias: 'c', description: 'Fast targeted re-verification of specific probe checks', args: '<url> [ids]' },
  { name: 'ci', description: 'Enterprise CI quality gate & PR drift detector', args: '[--fail-under]' },
  { name: 'routes', alias: 'rt', description: 'Scan & list discovered API endpoints and route signatures', args: '' },
  { name: 'bench', description: 'Run Agent Readiness Benchmark (ARB) evaluation suite', args: '[--suite]' },
  { name: 'model', alias: 'm', description: 'Inspect or switch active model (e.g. qwen/qwen3.6-27b)', args: '[target]' },
  { name: 'connect', description: 'Connect AI provider (Groq, Anthropic, OpenAI, Ollama, Gemini)', args: '[provider] [key] [model]' },
  { name: 'key', description: 'Set or update API key for active provider', args: '<apiKey>' },
  { name: 'config', description: 'View or set API keys and scanner preferences', args: '[list|set|reset]' },
  { name: 'help', alias: 'h', description: 'Display command handbook and options', args: '' },
  { name: 'exit', alias: 'q', description: 'Exit Glintbase CLI', args: '' },
];

/**
 * Filter slash commands by user search prefix.
 */
export function filterSlashCommands(query: string): SlashCommand[] {
  const clean = query.replace(/^\//, '').toLowerCase().trim();
  if (!clean) return BUILTIN_SLASH_COMMANDS;
  return BUILTIN_SLASH_COMMANDS.filter(
    cmd => cmd.name.toLowerCase().startsWith(clean) || (cmd.alias && cmd.alias.toLowerCase() === clean)
  );
}

/**
 * Truncate a string to max visible characters while preserving ANSI styling.
 */
function truncateVisible(str: string, maxLen: number): string {
  if (stripAnsi(str).length <= maxLen) return str;
  let visible = 0;
  let result = '';
  let inEscape = false;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\x1b') inEscape = true;
    if (inEscape) {
      result += str[i];
      if (str[i] === 'm') inEscape = false;
    } else {
      if (visible >= maxLen - 1) {
        result += '…';
        break;
      }
      result += str[i];
      visible++;
    }
  }
  return result + '\x1b[0m';
}

/**
 * Pad a content line to exact inner box width accounting for ANSI escapes.
 * Clamps content to innerWidth so borders never get pushed or wrapped.
 */
function formatBoxLine(
  content: string,
  innerWidth: number,
  leftBorder: string = brand.subtleBorder('│'),
  rightBorder: string = brand.subtleBorder('│')
): string {
  const clamped = truncateVisible(content, innerWidth);
  const visibleLen = stripAnsi(clamped).length;
  const padding = Math.max(0, innerWidth - visibleLen);
  return leftBorder + clamped + ' '.repeat(padding) + rightBorder;
}

/**
 * Generate full terminal screen buffer matching OpenCode layout.
 */
export function buildScreenBuffer(
  input: string,
  modelInfo: EffectiveModelInfo,
  frameworkName: string,
  selectedIndex: number,
  showDropdown: boolean,
  filteredCommands: SlashCommand[],
  cwd: string,
  version: string
): string[] {
  const terminalWidth = process.stdout.columns || 80;
  const logoWidth = 69;
  const logoIndent = Math.max(1, Math.floor((terminalWidth - logoWidth) / 2));
  const logoPad = ' '.repeat(logoIndent);

  // Box width: 72 chars or 90% of terminal width
  const boxWidth = Math.min(74, Math.max(62, terminalWidth - 6));
  const innerWidth = boxWidth - 2;
  const boxIndent = Math.max(1, Math.floor((terminalWidth - boxWidth) / 2));
  const bPad = ' '.repeat(boxIndent);

  const lines: string[] = [];

  // Top spacing and centered logo (OpenCode style)
  lines.push('');
  for (const line of GLINTBASE_WORDMARK) {
    lines.push(logoPad + brand.orangeBold(line));
  }

  // Subtitle
  const subtitle = 'A G E N T   R E A D I N E S S   H A R N E S S';
  const subIndent = Math.max(1, Math.floor((terminalWidth - subtitle.length) / 2));
  lines.push(' '.repeat(subIndent) + pc.dim(subtitle));
  lines.push('');

  // Compact model display fitting comfortably inside box
  const modelDisplay = modelInfo.isConfigured
    ? `${pc.cyan(modelInfo.model!)} · ${pc.dim(modelInfo.provider!)}`
    : `${pc.yellow('None (Probes & AST)')} · ${pc.dim('/model to set')}`;

  if (showDropdown && filteredCommands.length > 0) {
    // 1. Top border of attached menu
    lines.push(bPad + brand.subtleBorder('╭' + '─'.repeat(innerWidth) + '╮'));

    // 2. Dropdown command items (attached directly above the input box)
    filteredCommands.slice(0, 8).forEach((cmd, idx) => {
      const isSelected = idx === selectedIndex;
      const cmdCol = `/${cmd.name}`.padEnd(12);
      const maxDescLen = innerWidth - 16;
      const descCol = cmd.description.length > maxDescLen
        ? cmd.description.slice(0, maxDescLen - 1) + '…'
        : cmd.description;

      if (isSelected) {
        // Full peach/orange solid highlight row across the interior (OpenCode Screenshot 2 style)
        const rowContent = `  ${cmdCol} ${descCol}`;
        const paddedRow = rowContent.padEnd(innerWidth).slice(0, innerWidth);
        const highlighted = `\x1b[48;2;255;153;102m\x1b[38;2;20;20;20m\x1b[1m${paddedRow}\x1b[0m`;
        lines.push(bPad + brand.subtleBorder('│') + highlighted + brand.subtleBorder('│'));
      } else {
        const rowContent = `  ${pc.white(cmdCol)} ${pc.dim(descCol)}`;
        lines.push(bPad + formatBoxLine(rowContent, innerWidth));
      }
    });

    // 3. Connecting divider between menu and prompt box
    lines.push(bPad + brand.subtleBorder('├' + '─'.repeat(innerWidth) + '┤'));
  } else {
    // Standard top border of prompt box
    lines.push(bPad + brand.subtleBorder('╭' + '─'.repeat(innerWidth) + '╮'));
  }

  // Input Line (Line 1 of Card)
  let inputContent: string;
  if (input.length > 0) {
    inputContent = `  ${brand.orange('│')} ${pc.bold(pc.white(input))}${pc.inverse(' ')}`;
  } else {
    inputContent = `  ${brand.orange('│')} ${pc.dim('Ask anything... "audit workspace", "fix agent gaps", "remediate"')}`;
  }
  lines.push(bPad + formatBoxLine(inputContent, innerWidth));

  // Telemetry Line (Line 2 of Card - compact and clean)
  const telemetryContent = `    ${brand.orange('Harness')}  ${modelDisplay}  ${pc.dim(frameworkName)}`;
  lines.push(bPad + formatBoxLine(telemetryContent, innerWidth));

  // Bottom Border of Card
  lines.push(bPad + brand.subtleBorder('╰' + '─'.repeat(innerWidth) + '╯'));

  // Shortcuts & Tip Hints Below Card
  if (showDropdown) {
    const tip = `${brand.orange('•')} ${pc.dim('Tip')} ${pc.dim('Press')} ${brand.orangeBold('tab')} ${pc.dim('or')} ${brand.orangeBold('enter')} ${pc.dim('to select')}   ${pc.dim('↑/↓ to navigate')}   ${pc.dim('esc to dismiss')}`;
    const tipLen = stripAnsi(tip).length;
    const tipIndent = Math.max(1, Math.floor((terminalWidth - tipLen) / 2));
    lines.push(' '.repeat(tipIndent) + tip);
  } else {
    const hints = `${pc.dim('tab')} ${pc.dim('commands')}   ${brand.orangeBold('[Enter]')} ${pc.dim('Audit')}   ${brand.orangeBold('[/]')} ${pc.dim('Commands')}   ${brand.orangeBold('[f]')} ${pc.dim('Fix')}   ${brand.orangeBold('[r]')} ${pc.dim('Remediate')}   ${brand.orangeBold('[q]')} ${pc.dim('Quit')}`;
    const hintsLen = stripAnsi(hints).length;
    const hintsIndent = Math.max(1, Math.floor((terminalWidth - hintsLen) / 2));
    lines.push(' '.repeat(hintsIndent) + hints);
  }

  lines.push('');

  // Bottom Footer (Workspace left, Version right)
  const displayCwd = cwd.length > 38 ? '...' + cwd.slice(-35) : cwd;
  const footerLeft = pc.dim(displayCwd);
  const footerRight = pc.dim(`v${version}`);
  const footerSpace = Math.max(2, terminalWidth - stripAnsi(displayCwd).length - version.length - 3);
  lines.push(footerLeft + ' '.repeat(footerSpace) + footerRight);

  return lines;
}

/**
 * Read interactive command input with live `/` slash command suggestions.
 * Uses cursor repositioning to update in-place without scrolling or duplicating.
 */
export async function promptConsoleInput(options: {
  cwd?: string;
  flags?: Record<string, any>;
  version?: string;
} = {}): Promise<string> {
  const cwd = options.cwd || process.cwd();
  const version = options.version || '2.0.0';
  const modelInfo = getEffectiveModelInfo(options.flags || {});

  let frameworkName = 'Node.js Application';
  try {
    const profile = detectFramework(cwd);
    frameworkName = profile.name;
  } catch {
    /* fallback */
  }

  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`  ${brand.orange('glintbase')} ${pc.dim('>')} `, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

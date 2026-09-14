/**
 * Glintbase Startup Screen & Brand Graphics Engine.
 * Minimalist, high-impact aesthetic inspired by OpenCode:
 * Features a pure typographic GLINTBASE wordmark in Solar Neon Orange (#FF3300),
 * letterspaced subtitle, and truthful ambient model detection.
 */

import pc from 'picocolors';
import { detectFramework } from '../ast/frameworkDetector.js';
import { getEffectiveModelInfo } from '../config.js';

// Glintbase Brand Color Palette (Solar Neon Red-Orange #FF3300)
export const brand = {
  orange: (str: string) => `\x1b[38;2;255;51;0m${str}\x1b[39m`,
  orangeBold: (str: string) => `\x1b[1m\x1b[38;2;255;51;0m${str}\x1b[39m\x1b[22m`,
  amber: (str: string) => `\x1b[38;2;255;102;51m${str}\x1b[39m`,
  glow: (str: string) => `\x1b[38;2;255;136;85m${str}\x1b[39m`,
  dimOrange: (str: string) => `\x1b[38;2;180;40;0m${str}\x1b[39m`,
  border: (str: string) => `\x1b[38;2;255;51;0m${str}\x1b[39m`,
  subtleBorder: (str: string) => `\x1b[38;2;80;80;80m${str}\x1b[39m`,
};

/**
 * Remove ANSI escape sequences to compute visual character length.
 */
export function stripAnsi(str: string): string {
  // Full ECMA-48 ANSI escape sequence regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/**
 * Accurately pad a line within a hairline box accounting for non-printable ANSI escapes.
 */
export function padBoxLine(content: string, width = 78, borderFunc = brand.border): string {
  const visibleLen = stripAnsi(content).length;
  const padding = Math.max(0, width - 2 - visibleLen);
  return borderFunc('│') + content + ' '.repeat(padding) + borderFunc('│');
}

/**
 * Pure Typographic GLINTBASE Block Wordmark (69 chars wide, 5 lines)
 */
export const GLINTBASE_WORDMARK = [
  ' ▄████  ██      ██  ███   ██  ██████  █████▄   ▄████▄  ▄█████  ██████',
  '██      ██      ██  ████  ██    ██    ██   ██ ██    ██ ██      ██    ',
  '██ ▄██  ██      ██  ██ ██ ██    ██    █████▀  ████████  ▀████▄ █████ ',
  '██   ██ ██      ██  ██  ████    ██    ██   ██ ██    ██      ██ ██    ',
  ' ▀████▀ ███████ ██  ██   ███    ██    █████▀  ██    ██ ██████▀ ██████',
];

/**
 * Render the centered GLINTBASE wordmark and letterspaced subtitle.
 */
export function renderBrandHeader(): void {
  const terminalWidth = process.stdout.columns || 80;
  const logoWidth = 69;
  const indent = Math.max(2, Math.floor((terminalWidth - logoWidth) / 2));
  const pad = ' '.repeat(indent);

  console.log('');
  console.log('');

  // 1. Centered GLINTBASE Wordmark in Brand Orange (#FF3300)
  for (const line of GLINTBASE_WORDMARK) {
    console.log(pad + brand.orangeBold(line));
  }

  // 2. Letterspaced Subtitle
  const subtitle = 'A G E N T   R E A D I N E S S   H A R N E S S';
  const subIndent = Math.max(2, Math.floor((terminalWidth - subtitle.length) / 2));
  console.log('');
  console.log(' '.repeat(subIndent) + pc.dim(subtitle));
  console.log('');
}

/**
 * Render complete OpenCode-style minimalist Glintbase Startup Screen.
 */
export function renderStartupScreen(options: {
  cwd?: string;
  provider?: string;
  model?: string;
  version?: string;
  userName?: string;
} = {}): void {
  const cwd = options.cwd || process.cwd();
  const version = options.version || '2.0.0';
  const modelInfo = getEffectiveModelInfo();

  // Detect workspace framework
  let frameworkName = 'Node.js Workspace';
  try {
    const profile = detectFramework(cwd);
    frameworkName = profile.name;
  } catch {
    /* fallback */
  }

  const terminalWidth = process.stdout.columns || 80;

  renderBrandHeader();

  // 3. Floating Sleek Command Box
  const boxWidth = Math.min(78, terminalWidth - 2);
  const boxIndent = Math.max(1, Math.floor((terminalWidth - boxWidth) / 2));
  const bPad = ' '.repeat(boxIndent);

  const modelDisplay = modelInfo.isConfigured
    ? `${pc.cyan(modelInfo.model!)} · ${pc.dim(modelInfo.provider!)}`
    : `${pc.yellow('None (Deterministic AST)')} · ${pc.dim('Run glintbase connect')}`;

  console.log(bPad + brand.subtleBorder('╭' + '─'.repeat(boxWidth - 2) + '╮'));
  console.log(
    bPad +
      padBoxLine(
        `  ${brand.orange('▲')} ${pc.bold('Agent Readiness Harness')} ${pc.dim('· Industry-Grade Agent Infrastructure')}`,
        boxWidth,
        brand.subtleBorder
      )
  );
  console.log(
    bPad +
      padBoxLine(
        `    ${pc.dim('Engine:')} ${modelDisplay} · ${brand.amber(frameworkName)} · ${pc.dim('ARS v2.0')}`,
        boxWidth,
        brand.subtleBorder
      )
  );
  console.log(bPad + brand.subtleBorder('╰' + '─'.repeat(boxWidth - 2) + '╯'));
  console.log('');

  // 4. Key Commands Reference
  const cmds = [
    `  ${brand.orangeBold('glintbase audit')}       ${pc.dim('Run full ARS 2.0 readiness audit on codebase or URL')}`,
    `  ${brand.orangeBold('glintbase fix')}         ${pc.dim('Autonomously remediate agent gaps (deterministic or --ai)')}`,
    `  ${brand.orangeBold('glintbase doctor')}      ${pc.dim('Check system, framework, and manifest surface health')}`,
    `  ${brand.orangeBold('glintbase generate')}    ${pc.dim('Generate living agent specifications (robots, llms, mcp)')}`,
    `  ${brand.orangeBold('glintbase init')}        ${pc.dim('Initialize agent resource discovery (.well-known/ard.json)')}`,
  ];
  for (const cmd of cmds) {
    console.log(cmd);
  }
  console.log('');

  // 5. Corner Footer (Path on left, version on right)
  const displayCwd = cwd.length > 45 ? '...' + cwd.slice(-42) : cwd;
  const footerLeft = pc.dim(displayCwd);
  const footerRight = pc.dim(`v${version}`);
  const footerSpacing = Math.max(2, terminalWidth - stripAnsi(displayCwd).length - version.length - 5);
  console.log(footerLeft + ' '.repeat(footerSpacing) + footerRight);
  console.log('');
}

/**
 * Compact Header Banner for individual CLI commands (audit, check, fix)
 */
export function renderCommandHeader(title: string, target?: string): void {
  const width = 76;
  console.log('');
  console.log(brand.border('╭─ ') + brand.orangeBold(`GLINTBASE ${title.toUpperCase()}`) + brand.border(' ' + '─'.repeat(Math.max(2, width - title.length - 15)) + '╮'));
  if (target) {
    console.log(padBoxLine(`  ${pc.dim('Target    :')} ${pc.bold(pc.white(target))}`, width));
  }
  console.log(padBoxLine(`  ${pc.dim('Harness   :')} ${brand.amber('ARS 2.0 Benchmark Engine')} · ${pc.dim('Living Artifacts Swarm')}`, width));
  console.log(brand.border('╰' + '─'.repeat(width - 2) + '╯'));
  console.log('');
}

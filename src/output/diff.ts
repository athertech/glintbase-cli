/**
 * Interactive Diff Reviewer & Hairline TUI for Glintbase Agent Harness.
 * Provides single-key review ([Enter] Apply, [d] Diff, [r] Revise, [e] Edit, [s] Skip),
 * syntax-colored unified diffs, and $EDITOR integration.
 */

import { spawnSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import pc from 'picocolors';
import readline from 'readline';

export interface DiffReviewItem {
  file: string;
  path: string;
  subagentName: string;
  action: 'create' | 'modify';
  originalContent?: string;
  proposedContent: string;
  sandboxPassed: boolean;
  scoreImpact?: number;
  diff?: string;
}

export type ReviewDecision =
  | { action: 'apply'; content: string }
  | { action: 'revise'; prompt: string }
  | { action: 'skip' }
  | { action: 'quit' };

/**
 * Format colored unified diff output with hairline indicators.
 */
export function formatColoredDiff(diffText: string): string {
  const lines = diffText.split('\n');
  const formatted = lines.map(line => {
    if (line.startsWith('---') || line.startsWith('+++')) {
      return pc.dim(line);
    }
    if (line.startsWith('@@')) {
      return pc.cyan(line);
    }
    if (line.startsWith('+')) {
      return pc.green(line);
    }
    if (line.startsWith('-')) {
      return pc.red(line);
    }
    return pc.dim(' ') + line.slice(1);
  });

  return formatted.join('\n');
}

/**
 * Render hairline card summarizing the proposed remediation.
 */
export function renderArtifactCard(item: DiffReviewItem, index: number, total: number): void {
  const width = 80;
  const top = `╭─ [${index + 1}/${total}] PROPOSED ARTIFACT: ${pc.bold(pc.white(item.file))} ${'─'.repeat(Math.max(2, width - item.file.length - 35))}╮`;
  const bottom = `╰${'─'.repeat(width - 2)}╯`;

  const actionStr =
    item.action === 'create'
      ? pc.green(`Create new file (${Buffer.byteLength(item.proposedContent, 'utf-8')} bytes)`)
      : pc.yellow(`Modify existing file (AST injection)`);

  const sandboxStr = item.sandboxPassed
    ? pc.green('PASS') + (item.scoreImpact ? pc.green(` (+${item.scoreImpact} pts)`) : '')
    : pc.red('FAILED IN-MEMORY ARS');

  console.log('\n' + pc.cyan(top));
  console.log(pc.cyan('│') + `  ${pc.dim('Subagent   :')} ${pc.white(item.subagentName)}`.padEnd(width + 8, ' ') + pc.cyan('│'));
  console.log(pc.cyan('│') + `  ${pc.dim('Target File:')} ${pc.bold(pc.cyan(item.path))}`.padEnd(width + 17, ' ') + pc.cyan('│'));
  console.log(pc.cyan('│') + `  ${pc.dim('Operation  :')} ${actionStr}`.padEnd(width + 17, ' ') + pc.cyan('│'));
  console.log(pc.cyan('│') + `  ${pc.dim('ARS Sandbox:')} ${sandboxStr}`.padEnd(width + 17, ' ') + pc.cyan('│'));
  console.log(pc.cyan(bottom));
}

/**
 * Print the single-key action bar.
 */
export function printActionBar(): void {
  console.log(
    `  ${pc.bold('[Enter]')} ${pc.green('Apply')}   ` +
    `${pc.bold('[d]')} ${pc.cyan('Diff')}   ` +
    `${pc.bold('[r]')} ${pc.yellow('Revise prompt')}   ` +
    `${pc.bold('[e]')} ${pc.blue('Edit ($EDITOR)')}   ` +
    `${pc.bold('[s]')} ${pc.dim('Skip')}   ` +
    `${pc.bold('[q]')} ${pc.red('Quit')}`
  );
}

/**
 * Wait for a single keypress in TTY raw mode.
 */
function readSingleKey(): Promise<string> {
  return new Promise(resolve => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
      // Non-interactive fallback: auto-apply
      resolve('\r');
      return;
    }

    const wasRaw = Boolean(process.stdin.isRaw);
    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    } catch {
      resolve('\r');
      return;
    }

    const onData = (buffer: Buffer) => {
      const key = buffer.toString();
      // Handle Ctrl+C
      if (key === '\u0003') {
        process.stdin.removeListener('data', onData);
        if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') process.stdin.setRawMode(wasRaw);
        process.stdin.pause();
        process.exit(0);
      }

      process.stdin.removeListener('data', onData);
      if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      resolve(key);
    };

    process.stdin.on('data', onData);
  });
}

/**
 * Prompt user for a text string (e.g. for subagent revision).
 */
function promptTextInput(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(query, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Spawn system editor ($EDITOR, $VISUAL, or fallback) to edit artifact content.
 */
export function openInEditor(initialContent: string, fileExtension = '.txt'): string {
  const tempPath = join(tmpdir(), `glintbase-edit-${Date.now()}${fileExtension}`);
  writeFileSync(tempPath, initialContent, 'utf-8');

  const editor =
    process.env.VISUAL ||
    process.env.EDITOR ||
    (process.platform === 'win32' ? 'notepad' : 'nano');

  console.log(pc.dim(`\n  Opening in ${editor}... (save and exit editor when finished)`));

  try {
    const parts = editor.split(' ');
    const cmd = parts[0];
    const args = [...parts.slice(1), tempPath];

    spawnSync(cmd, args, { stdio: 'inherit' });

    if (existsSync(tempPath)) {
      const modified = readFileSync(tempPath, 'utf-8');
      unlinkSync(tempPath);
      return modified;
    }
  } catch (err: any) {
    console.log(pc.yellow(`  Failed to launch editor (${err.message}). Using original content.`));
  }

  return initialContent;
}

/**
 * Main Interactive Diff Reviewer loop for an individual artifact item.
 */
export async function reviewArtifact(
  item: DiffReviewItem,
  index: number,
  total: number,
  options: { interactive?: boolean } = {}
): Promise<ReviewDecision> {
  let currentContent = item.proposedContent;

  // In non-interactive, CI, or test environments, automatically accept
  if (
    options.interactive === false ||
    !process.stdin.isTTY ||
    process.env.CI ||
    process.env.VITEST ||
    process.env.NODE_ENV === 'test'
  ) {
    return { action: 'apply', content: currentContent };
  }

  while (true) {
    renderArtifactCard({ ...item, proposedContent: currentContent }, index, total);
    printActionBar();

    const key = await readSingleKey();

    // 1. Enter or 'a' -> Apply
    if (key === '\r' || key === '\n' || key.toLowerCase() === 'a') {
      console.log(`\n  ${pc.green('✔')} Applied ${pc.bold(item.file)}`);
      return { action: 'apply', content: currentContent };
    }

    // 2. 'd' -> Show Diff
    if (key.toLowerCase() === 'd') {
      console.log('\n' + pc.cyan(`╭─ DIFF: ${item.file} ${'─'.repeat(Math.max(2, 65 - item.file.length))}╮`));
      if (item.diff) {
        console.log(formatColoredDiff(item.diff));
      } else if (item.originalContent) {
        // Simple preview of diff
        const diffHeader = `--- a/${item.file}\n+++ b/${item.file}\n`;
        console.log(pc.dim(diffHeader));
        console.log(
          formatColoredDiff(
            item.proposedContent
              .split('\n')
              .map(l => `+${l}`)
              .join('\n')
          )
        );
      } else {
        // New file preview
        console.log(pc.dim(`--- /dev/null\n+++ b/${item.file}`));
        console.log(
          formatColoredDiff(
            currentContent
              .split('\n')
              .map(l => `+${l}`)
              .slice(0, 50)
              .join('\n')
          )
        );
        if (currentContent.split('\n').length > 50) {
          console.log(pc.dim(`... (${currentContent.split('\n').length - 50} more lines)`));
        }
      }
      console.log(pc.cyan(`╰${'─'.repeat(74)}╯\n`));
      continue;
    }

    // 3. 'r' -> Revise prompt with subagent
    if (key.toLowerCase() === 'r') {
      console.log('');
      const revisionPrompt = await promptTextInput(
        pc.yellow(`  ✦ Enter revision instructions for ${item.subagentName}:\n  > `)
      );
      if (revisionPrompt) {
        return { action: 'revise', prompt: revisionPrompt };
      }
      continue;
    }

    // 4. 'e' -> Edit in $EDITOR
    if (key.toLowerCase() === 'e') {
      const ext = item.file.includes('.') ? '.' + item.file.split('.').pop() : '.txt';
      currentContent = openInEditor(currentContent, ext);
      console.log(pc.green(`  ✔ Updated content from editor buffer (${Buffer.byteLength(currentContent, 'utf-8')} bytes)`));
      continue;
    }

    // 5. 's' -> Skip
    if (key.toLowerCase() === 's') {
      console.log(`\n  ${pc.dim('○')} Skipped ${item.file}`);
      return { action: 'skip' };
    }

    // 6. 'q' -> Quit
    if (key.toLowerCase() === 'q') {
      console.log(`\n  ${pc.red('✕')} Cancelled remediation.`);
      return { action: 'quit' };
    }
  }
}

/**
 * White-Box AST Inspector: Middleware Inspection
 * Specification: GLINTBASE_AUDIT_3_0_UPGRADE_SPEC.md (Section 4.1)
 *
 * Verifies that Next.js middleware (middleware.ts or src/middleware.ts):
 * 1. Checks Accept: text/markdown or bot User-Agents (ClaudeBot, GPTBot)
 * 2. Injects Vary: Accept to avoid CDN cache poisoning
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';

export interface MiddlewareInspectionResult {
  found: boolean;
  file?: string;
  handlesMarkdownNegotiation: boolean;
  handlesBotUserAgents: boolean;
  setsVaryAccept: boolean;
  codeSnippet?: string;
}

export function inspectMiddleware(rootDir: string): MiddlewareInspectionResult {
  const candidates = [
    join(rootDir, 'middleware.ts'),
    join(rootDir, 'src', 'middleware.ts'),
    join(rootDir, 'middleware.js'),
    join(rootDir, 'src', 'middleware.js'),
  ];

  let targetFile: string | undefined;
  for (const c of candidates) {
    if (existsSync(c)) {
      targetFile = c;
      break;
    }
  }

  if (!targetFile) {
    return {
      found: false,
      handlesMarkdownNegotiation: false,
      handlesBotUserAgents: false,
      setsVaryAccept: false,
    };
  }

  const content = readFileSync(targetFile, 'utf-8');
  const lower = content.toLowerCase();

  // 1. Text checks for bot agents & markdown
  const handlesMarkdownNegotiation = lower.includes('text/markdown') || lower.includes('accept');
  const handlesBotUserAgents = lower.includes('claudebot') || lower.includes('gptbot') || lower.includes('user-agent') || lower.includes('perplexity');
  const setsVaryAccept = lower.includes('vary') && lower.includes('accept');

  // 2. AST parsing for verification
  let astSetsVary = false;
  try {
    const sourceFile = ts.createSourceFile(
      targetFile,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    function visit(node: ts.Node) {
      if (ts.isCallExpression(node)) {
        const text = node.getText(sourceFile).toLowerCase();
        if (text.includes('headers.set') && text.includes('vary') && text.includes('accept')) {
          astSetsVary = true;
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  } catch {
    astSetsVary = setsVaryAccept;
  }

  return {
    found: true,
    file: targetFile,
    handlesMarkdownNegotiation,
    handlesBotUserAgents,
    setsVaryAccept: setsVaryAccept || astSetsVary,
    codeSnippet: content.slice(0, 500),
  };
}

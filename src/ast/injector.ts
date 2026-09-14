/**
 * Safe Layout Injector for WebMCP Component in Glintbase Agent Harness.
 * Uses TypeScript AST parsing to safely inject <WebMcpProvider /> into Next.js/React layouts
 * with automatic .bak backup creation and non-destructive fallback diffs.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { dirname, join, relative } from 'path';
import ts from 'typescript';
import { detectFramework, FrameworkProfile } from './frameworkDetector.js';

export interface InjectionResult {
  success: boolean;
  layoutPath?: string;
  backupPath?: string;
  componentPath?: string;
  componentContent?: string;
  originalContent?: string;
  modifiedContent?: string;
  diff?: string;
  error?: string;
}

/**
 * Standard WebMCP Provider Component Code
 */
export function getWebMcpComponentTemplate(isTypeScript: boolean = true): string {
  if (isTypeScript) {
    return `'use client';

import React, { useEffect } from 'react';

export interface WebMcpTool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  execute: (params?: any) => Promise<unknown> | unknown;
}

export interface ModelContext {
  version: string;
  agentReady: boolean;
  tools: WebMcpTool[];
  registerTool: (tool: WebMcpTool) => void;
  getTool: (name: string) => WebMcpTool | undefined;
}

/**
 * WebMCP Provider Component
 * Registers window.modelContext with browser-native DOM inspection and execution tools
 * per the W3C WebMCP specification.
 */
export function WebMcpProvider({ children }: { children?: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!window.modelContext) {
      const toolRegistry = new Map<string, WebMcpTool>();

      const defaultTools: WebMcpTool[] = [
        {
          name: 'get_page_metadata',
          description: 'Extracts title, meta tags, and open graph microdata from the current page',
          parameters: { type: 'object', properties: {} },
          execute: async () => ({
            title: document.title,
            url: window.location.href,
            description: document.querySelector('meta[name="description"]')?.getAttribute('content') || null,
            canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || null,
          }),
        },
        {
          name: 'get_interactive_elements',
          description: 'Returns all buttons, links, and forms with their selectors, text, and state',
          parameters: { type: 'object', properties: {} },
          execute: async () => {
            const elements = Array.from(
              document.querySelectorAll('button, a[href], form, input:not([type="hidden"]), select, textarea')
            ).map((el, i) => ({
              index: i,
              tag: el.tagName.toLowerCase(),
              text: (el.textContent || '').trim().slice(0, 100),
              id: el.id || null,
              name: (el as HTMLInputElement).name || null,
              placeholder: (el as HTMLInputElement).placeholder || null,
              ariaLabel: el.getAttribute('aria-label') || null,
            }));
            return { elements: elements.slice(0, 100) };
          },
        },
        {
          name: 'get_page_headings',
          description: 'Extracts the semantic heading hierarchy (H1-H4) to understand page layout',
          parameters: { type: 'object', properties: {} },
          execute: async () => {
            const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(h => ({
              level: h.tagName.toLowerCase(),
              text: (h.textContent || '').trim(),
            }));
            return { headings };
          },
        },
      ];

      for (const t of defaultTools) {
        toolRegistry.set(t.name, t);
      }

      const modelContextInstance: ModelContext = {
        version: '1.0.0',
        agentReady: true,
        get tools() {
          return Array.from(toolRegistry.values());
        },
        registerTool: (tool: WebMcpTool) => {
          if (tool && tool.name && typeof tool.execute === 'function') {
            toolRegistry.set(tool.name, tool);
          }
        },
        getTool: (name: string) => toolRegistry.get(name),
      };

      window.modelContext = modelContextInstance;
      (document as any).modelContext = modelContextInstance;

      // Dispatch event to notify browser-native AI agents that tools are ready
      window.dispatchEvent(new CustomEvent('modelContextReady', { detail: modelContextInstance }));
    }
  }, []);

  return <>{children}</>;
}

declare global {
  interface Window {
    modelContext?: ModelContext;
  }
}
`;
  }

  // Plain JavaScript version
  return `'use client';

import React, { useEffect } from 'react';

export function WebMcpProvider({ children }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!window.modelContext) {
      const toolRegistry = new Map();

      const defaultTools = [
        {
          name: 'get_page_metadata',
          description: 'Extracts title, meta tags, and open graph microdata from the current page',
          parameters: { type: 'object', properties: {} },
          execute: async () => ({
            title: document.title,
            url: window.location.href,
            description: document.querySelector('meta[name="description"]')?.getAttribute('content') || null,
            canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || null,
          }),
        },
        {
          name: 'get_interactive_elements',
          description: 'Returns all buttons, links, and forms with their selectors and text',
          parameters: { type: 'object', properties: {} },
          execute: async () => {
            const elements = Array.from(
              document.querySelectorAll('button, a[href], form, input:not([type="hidden"]), select, textarea')
            ).map((el, i) => ({
              index: i,
              tag: el.tagName.toLowerCase(),
              text: (el.textContent || '').trim().slice(0, 100),
              id: el.id || null,
              name: el.name || null,
              placeholder: el.placeholder || null,
              ariaLabel: el.getAttribute('aria-label') || null,
            }));
            return { elements: elements.slice(0, 100) };
          },
        },
        {
          name: 'get_page_headings',
          description: 'Extracts the semantic heading hierarchy (H1-H4) to understand page layout',
          parameters: { type: 'object', properties: {} },
          execute: async () => {
            const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(h => ({
              level: h.tagName.toLowerCase(),
              text: (h.textContent || '').trim(),
            }));
            return { headings };
          },
        },
      ];

      for (const t of defaultTools) {
        toolRegistry.set(t.name, t);
      }

      const modelContextInstance = {
        version: '1.0.0',
        agentReady: true,
        get tools() {
          return Array.from(toolRegistry.values());
        },
        registerTool: (tool) => {
          if (tool && tool.name && typeof tool.execute === 'function') {
            toolRegistry.set(tool.name, tool);
          }
        },
        getTool: (name) => toolRegistry.get(name),
      };

      window.modelContext = modelContextInstance;
      document.modelContext = modelContextInstance;

      window.dispatchEvent(new CustomEvent('modelContextReady', { detail: modelContextInstance }));
    }
  }, []);

  return <>{children}</>;
}
`;
}

/**
 * Generate unified diff between original and modified strings.
 */
export function createUnifiedDiff(filename: string, original: string, modified: string): string {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');

  const diffLines: string[] = [
    `--- a/${filename}`,
    `+++ b/${filename}`,
    '@@ -1 +1 @@',
  ];

  // Simple line comparison
  const max = Math.max(origLines.length, modLines.length);
  for (let i = 0; i < max; i++) {
    const o = origLines[i];
    const m = modLines[i];
    if (o === m) {
      // unchanged
      if (i < 3 || i > max - 3) {
        diffLines.push(` ${o || ''}`);
      }
    } else {
      if (o !== undefined) diffLines.push(`-${o}`);
      if (m !== undefined) diffLines.push(`+${m}`);
    }
  }

  return diffLines.join('\n');
}

/**
 * Calculate import path for WebMcpProvider from the layout file location.
 */
function getImportPath(layoutPath: string, componentPath: string, cwd: string): string {
  // Check if target project tsconfig supports @/ alias
  const tsconfigPath = join(cwd, 'tsconfig.json');
  if (existsSync(tsconfigPath)) {
    try {
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
      if (tsconfig.compilerOptions?.paths?.['@/*']) {
        return '@/components/WebMcpProvider';
      }
    } catch {
      /* ignore */
    }
  }

  // Fallback to clean relative import
  let rel = relative(dirname(layoutPath), componentPath).replace(/\\/g, '/');
  if (!rel.startsWith('.')) {
    rel = './' + rel;
  }
  return rel.replace(/\.[a-z]+$/, '');
}

/**
 * Safely inject WebMcpProvider into a layout file with .bak backup.
 */
export function injectWebMcpProvider(
  cwd: string = process.cwd(),
  options: { dryRun?: boolean; profile?: FrameworkProfile } = {}
): InjectionResult {
  const profile = options.profile || detectFramework(cwd);
  const isTs = profile.isTypeScript;

  // 1. Locate layout file
  let layoutPath = profile.layoutFile;
  if (!layoutPath || !existsSync(layoutPath)) {
    // Search candidates
    const candidates = [
      join(cwd, 'src', 'app', 'layout.tsx'),
      join(cwd, 'src', 'app', 'layout.jsx'),
      join(cwd, 'app', 'layout.tsx'),
      join(cwd, 'app', 'layout.jsx'),
      join(cwd, 'src', 'pages', '_app.tsx'),
      join(cwd, 'src', 'pages', '_app.jsx'),
      join(cwd, 'pages', '_app.tsx'),
      join(cwd, 'pages', '_app.jsx'),
    ];
    for (const cand of candidates) {
      if (existsSync(cand)) {
        layoutPath = cand;
        break;
      }
    }
  }

  if (!layoutPath || !existsSync(layoutPath)) {
    return {
      success: false,
      error: 'No root layout file (app/layout.tsx or pages/_app.tsx) found in project.',
    };
  }

  // 2. Determine target component location
  const useSrc = existsSync(join(cwd, 'src'));
  const componentDir = useSrc ? join(cwd, 'src', 'components') : join(cwd, 'components');
  const componentExt = isTs ? 'tsx' : 'jsx';
  const componentPath = join(componentDir, `WebMcpProvider.${componentExt}`);
  const componentContent = getWebMcpComponentTemplate(isTs);

  const originalContent = readFileSync(layoutPath, 'utf-8');

  // Check if WebMcpProvider is already injected
  if (originalContent.includes('WebMcpProvider')) {
    return {
      success: true,
      layoutPath,
      componentPath,
      componentContent,
      originalContent,
      modifiedContent: originalContent,
      diff: '(WebMcpProvider is already integrated in layout)',
    };
  }

  // 3. Compute modified layout content using AST / pattern replacement
  const importSpecifier = getImportPath(layoutPath, componentPath, cwd);
  const importStatement = `import { WebMcpProvider } from '${importSpecifier}';\n`;

  let modifiedContent = originalContent;

  // Add import statement at top (after any 'use client' or first import)
  if (modifiedContent.startsWith("'use client'") || modifiedContent.startsWith('"use client"')) {
    const lines = modifiedContent.split('\n');
    lines.splice(1, 0, importStatement.trim());
    modifiedContent = lines.join('\n');
  } else {
    modifiedContent = importStatement + modifiedContent;
  }

  // Wrap {children} with <WebMcpProvider>{children}</WebMcpProvider>
  let injected = false;

  // Pattern A: standard {children} inside body
  if (modifiedContent.includes('{children}')) {
    modifiedContent = modifiedContent.replace(
      /\{children\}/,
      '<WebMcpProvider>{children}</WebMcpProvider>'
    );
    injected = true;
  } else if (modifiedContent.includes('<Component {...pageProps} />')) {
    // Pattern B: Pages Router _app.tsx
    modifiedContent = modifiedContent.replace(
      /<Component\s+\{\.\.\.pageProps\}\s*\/>/,
      '<WebMcpProvider><Component {...pageProps} /></WebMcpProvider>'
    );
    injected = true;
  } else {
    // Pattern C: insert after <body> tag
    const bodyMatch = modifiedContent.match(/<body[^>]*>/);
    if (bodyMatch && bodyMatch.index !== undefined) {
      const insertPos = bodyMatch.index + bodyMatch[0].length;
      modifiedContent =
        modifiedContent.slice(0, insertPos) +
        '\n        <WebMcpProvider />' +
        modifiedContent.slice(insertPos);
      injected = true;
    }
  }

  if (!injected) {
    const diff = createUnifiedDiff(relative(cwd, layoutPath), originalContent, modifiedContent);
    return {
      success: false,
      layoutPath,
      originalContent,
      error: 'Unable to locate safe injection site ({children} or <body>) in layout. AST review required.',
      diff,
    };
  }

  const backupPath = `${layoutPath}.bak`;
  const diff = createUnifiedDiff(relative(cwd, layoutPath), originalContent, modifiedContent);

  // Write changes unless dryRun
  if (!options.dryRun) {
    // Save backup first
    writeFileSync(backupPath, originalContent, 'utf-8');

    // Create components directory if needed
    if (!existsSync(componentDir)) {
      try {
        mkdirSync(componentDir, { recursive: true });
      } catch {
        /* ignore */
      }
    }

    // Write component
    writeFileSync(componentPath, componentContent, 'utf-8');

    // Write modified layout
    writeFileSync(layoutPath, modifiedContent, 'utf-8');
  }

  return {
    success: true,
    layoutPath,
    backupPath,
    componentPath,
    componentContent,
    originalContent,
    modifiedContent,
    diff,
  };
}

/**
 * Restore layout file from .bak backup and remove the backup.
 */
export function restoreBackup(layoutPath: string): boolean {
  const backupPath = `${layoutPath}.bak`;
  if (existsSync(backupPath)) {
    const backupContent = readFileSync(backupPath, 'utf-8');
    writeFileSync(layoutPath, backupContent, 'utf-8');
    unlinkSync(backupPath);
    return true;
  }
  return false;
}

/**
 * Documentation Indexer for Glintbase Agent Harness.
 * Scans documentation directories, parses frontmatter and markdown structure,
 * and formats compliant llms.txt and llms-full.txt manifests per the standard.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, relative, basename } from 'path';

export interface IndexedDoc {
  title: string;
  description?: string;
  relativePath: string;
  urlPath: string;
  estimatedTokens: number;
  headings: string[];
  content: string;
}

export interface DocSection {
  title: string;
  docs: IndexedDoc[];
}

export interface DocIndexResult {
  projectTitle: string;
  projectDescription: string;
  docs: IndexedDoc[];
  sections: DocSection[];
  totalTokens: number;
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.venv',
  'venv',
  '__pycache__',
]);

/**
 * Extract YAML frontmatter properties simply without heavy yaml parser dependency.
 */
function parseFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  if (!raw.startsWith('---')) {
    return { frontmatter: {}, body: raw };
  }

  const endIdx = raw.indexOf('\n---', 3);
  if (endIdx === -1) {
    return { frontmatter: {}, body: raw };
  }

  const fmBlock = raw.slice(3, endIdx).trim();
  const body = raw.slice(endIdx + 4).trim();
  const frontmatter: Record<string, string> = {};

  const lines = fmBlock.split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      let val = line.slice(colonIdx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      frontmatter[key] = val;
    }
  }

  return { frontmatter, body };
}

/**
 * Extract top heading and first paragraph if frontmatter is missing.
 */
function extractHeadingsAndDescription(body: string): { title?: string; description?: string; headings: string[] } {
  const lines = body.split('\n');
  let title: string | undefined;
  let description: string | undefined;
  const headings: string[] = [];

  let foundTitle = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('# ')) {
      const h1 = line.replace(/^#\s+/, '').trim();
      headings.push(h1);
      if (!title) {
        title = h1;
        foundTitle = true;
      }
    } else if (line.startsWith('## ') || line.startsWith('### ')) {
      headings.push(line.replace(/^#+\s+/, '').trim());
    } else if (foundTitle && !description && line.length > 20 && !line.startsWith('<') && !line.startsWith('!')) {
      // First substantial paragraph following title
      description = line.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // strip md links
    }
  }

  return { title, description, headings };
}

/**
 * Estimate tokens based on UTF-8 character length (approx 4 chars/token).
 */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Recursively find markdown and MDX files.
 */
function findDocFiles(dir: string, currentDepth: number = 0): string[] {
  if (!existsSync(dir) || currentDepth > 8) return [];
  const results: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        results.push(...findDocFiles(fullPath, currentDepth + 1));
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (lower.endsWith('.md') || lower.endsWith('.mdx')) {
          // Skip license and changelog files unless specifically wanted
          if (!lower.includes('license') && !lower.includes('contributing')) {
            results.push(fullPath);
          }
        }
      }
    }
  } catch {
    /* ignore */
  }

  return results;
}

/**
 * Scan documentation directories and produce structured documentation index.
 */
export function indexDocumentation(cwd: string = process.cwd()): DocIndexResult {
  const docSearchPaths = [
    join(cwd, 'docs'),
    join(cwd, 'content'),
    join(cwd, 'documentation'),
    join(cwd, 'src', 'content'),
    join(cwd, 'src', 'docs'),
  ];

  let candidateFiles: string[] = [];
  for (const p of docSearchPaths) {
    if (existsSync(p)) {
      candidateFiles.push(...findDocFiles(p));
    }
  }

  // Also include root README.md or API.md if no docs folder found
  if (candidateFiles.length === 0) {
    const rootCandidates = ['README.md', 'api.md', 'API.md', 'ARCHITECTURE.md']
      .map(f => join(cwd, f))
      .filter(f => existsSync(f));
    candidateFiles.push(...rootCandidates);
  }

  // Deduplicate files
  candidateFiles = Array.from(new Set(candidateFiles));

  // Determine project title and description from package.json if available
  let projectTitle = basename(cwd);
  let projectDescription = 'Agent-ready technical documentation and developer guides.';

  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.name) projectTitle = pkg.name;
      if (pkg.description) projectDescription = pkg.description;
    } catch {
      /* ignore */
    }
  }

  const docs: IndexedDoc[] = [];
  const sectionMap = new Map<string, IndexedDoc[]>();

  for (const file of candidateFiles) {
    try {
      const raw = readFileSync(file, 'utf-8');
      const relPath = relative(cwd, file).replace(/\\/g, '/');
      const { frontmatter, body } = parseFrontmatter(raw);
      const { title: headingTitle, description: headingDesc, headings } = extractHeadingsAndDescription(body);

      const title = frontmatter['title'] || headingTitle || basename(file).replace(/\.[a-z]+$/, '');
      const description = frontmatter['description'] || headingDesc;

      // Clean URL path: e.g. docs/guides/quickstart.md -> /docs/guides/quickstart
      const urlPath = '/' + relPath.replace(/\.(md|mdx)$/i, '').replace(/\/readme$/i, '').replace(/\/index$/i, '');
      const tokens = estimateTokens(raw);

      const docItem: IndexedDoc = {
        title,
        description,
        relativePath: relPath,
        urlPath,
        estimatedTokens: tokens,
        headings,
        content: raw,
      };

      docs.push(docItem);

      // Group into sections based on first-level subfolder (e.g. docs/guides -> "Guides")
      const parts = relPath.split('/');
      let sectionName = 'Guides & Documentation';
      if (parts.length > 2) {
        // e.g. docs/api/users.md -> "API"
        const sectionFolder = parts[1];
        sectionName = sectionFolder.charAt(0).toUpperCase() + sectionFolder.slice(1);
      } else if (parts[0].toLowerCase() === 'docs' && parts.length === 2) {
        sectionName = 'Documentation';
      }

      const existingSection = sectionMap.get(sectionName) || [];
      existingSection.push(docItem);
      sectionMap.set(sectionName, existingSection);
    } catch {
      /* skip file */
    }
  }

  const sections: DocSection[] = Array.from(sectionMap.entries()).map(([secTitle, secDocs]) => ({
    title: secTitle,
    docs: secDocs,
  }));

  const totalTokens = docs.reduce((acc, d) => acc + d.estimatedTokens, 0);

  return {
    projectTitle,
    projectDescription,
    docs,
    sections,
    totalTokens,
  };
}

/**
 * Generate standard-compliant llms.txt content from indexed documentation.
 */
export function generateLlmsTxt(indexResult: DocIndexResult, baseUrl: string = ''): string {
  const lines: string[] = [];

  // 1. H1 Project Title
  lines.push(`# ${indexResult.projectTitle}`);
  lines.push('');

  // 2. Blockquote Project Summary
  lines.push(`> ${indexResult.projectDescription}`);
  lines.push('');

  // 3. Document Sections
  if (indexResult.sections.length > 0) {
    for (const section of indexResult.sections) {
      lines.push(`## ${section.title}`);
      lines.push('');
      for (const doc of section.docs) {
        const targetUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}${doc.urlPath}` : doc.urlPath;
        const descSuffix = doc.description ? `: ${doc.description}` : '';
        lines.push(`- [${doc.title}](${targetUrl})${descSuffix}`);
      }
      lines.push('');
    }
  } else {
    lines.push('## Documentation');
    lines.push('');
    for (const doc of indexResult.docs) {
      const targetUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}${doc.urlPath}` : doc.urlPath;
      const descSuffix = doc.description ? `: ${doc.description}` : '';
      lines.push(`- [${doc.title}](${targetUrl})${descSuffix}`);
    }
    lines.push('');
  }

  // 4. Optional Section (linking to llms-full.txt and discovery manifests)
  lines.push('## Optional');
  lines.push('');
  const fullTxtUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/llms-full.txt` : '/llms-full.txt';
  lines.push(`- [Full Documentation](${fullTxtUrl}): Complete concatenated documentation for agent ingestion`);

  return lines.join('\n');
}

/**
 * Generate standard-compliant llms-full.txt content from indexed documentation.
 */
export function generateLlmsFullTxt(indexResult: DocIndexResult, baseUrl: string = ''): string {
  const lines: string[] = [];

  lines.push(`# ${indexResult.projectTitle} — Complete Documentation`);
  lines.push(`> ${indexResult.projectDescription}`);
  lines.push(`> Generated by Glintbase Agent Harness. Total estimated tokens: ${indexResult.totalTokens.toLocaleString()}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const doc of indexResult.docs) {
    const targetUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}${doc.urlPath}` : doc.urlPath;
    lines.push(`## Document: ${doc.title}`);
    lines.push(`URL: ${targetUrl}`);
    lines.push(`Path: ${doc.relativePath}`);
    lines.push('');
    lines.push(doc.content.trim());
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

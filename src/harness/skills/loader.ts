/**
 * Agent Skills Engine for Glintbase Agent Harness.
 * Follows the agentskills.io standard (modeled after earendil-works/pi).
 * Parses SKILL.md manifests with YAML frontmatter and formats them for system prompts.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  version?: string;
  layer?: 'discovery' | 'access' | 'usability' | 'payments';
  [key: string]: unknown;
}

export interface Skill {
  name: string;
  description: string;
  layer?: 'discovery' | 'access' | 'usability' | 'payments';
  filePath: string;
  content: string;
  instructions: string;
}

/**
 * Parse frontmatter and markdown body from raw string.
 */
export function parseSkillContent(rawContent: string, fallbackName: string): Skill {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = rawContent.match(frontmatterRegex);

  let name = fallbackName;
  let description = '';
  let layer: 'discovery' | 'access' | 'usability' | 'payments' | undefined;
  let instructions = rawContent;

  if (match) {
    const yamlBlock = match[1];
    instructions = match[2].trim();

    // Simple robust YAML parser for standard frontmatter fields
    for (const line of yamlBlock.split(/\r?\n/)) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;
      const key = line.slice(0, colonIndex).trim();
      const val = line.slice(colonIndex + 1).trim().replace(/^['"]|['"]$/g, '');

      if (key === 'name') name = val;
      if (key === 'description') description = val;
      if (key === 'layer' && ['discovery', 'access', 'usability', 'payments'].includes(val)) {
        layer = val as any;
      }
    }
  }

  return {
    name,
    description,
    layer,
    filePath: '',
    content: rawContent,
    instructions,
  };
}

/**
 * Load a single SKILL.md file.
 */
export function loadSkillFile(filePath: string): Skill | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const skill = parseSkillContent(raw, basename(filePath, '.md'));
    skill.filePath = filePath;
    return skill;
  } catch {
    return null;
  }
}

/**
 * Scan a directory recursively for SKILL.md files.
 */
export function loadSkillsFromDir(dirPath: string): Skill[] {
  const skills: Skill[] = [];
  if (!existsSync(dirPath)) return skills;

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const skillFile = join(fullPath, 'SKILL.md');
        if (existsSync(skillFile)) {
          const s = loadSkillFile(skillFile);
          if (s) skills.push(s);
        } else {
          skills.push(...loadSkillsFromDir(fullPath));
        }
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        const s = loadSkillFile(fullPath);
        if (s) skills.push(s);
      }
    }
  } catch {
    /* ignore */
  }

  return skills;
}

/**
 * Format skills for inclusion in system prompts per the Agent Skills standard.
 */
export function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) return '';

  const lines = [
    '\n<available_skills>',
    'The following skills provide domain instructions and specifications for remediation:',
  ];

  for (const skill of skills) {
    lines.push('  <skill>');
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push('    <instructions>');
    lines.push(skill.instructions);
    lines.push('    </instructions>');
    lines.push('  </skill>');
  }

  lines.push('</available_skills>\n');
  return lines.join('\n');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

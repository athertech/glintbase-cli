/**
 * Glintbase bundled MCP skills for the CLI's MCP server and `glintbase_install_skill`.
 * The skill content comes from @glintbase/scanner-core, the single copy shared with
 * scan.glintbase.dev and @glintbase/mcp.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { BUNDLED_SKILLS, type BundledSkill } from '@glintbase/scanner-core';

export { BUNDLED_SKILLS };
export type { BundledSkill };

/**
 * Installs a bundled skill to the local repository filesystem.
 * Supports `.agents/skills/<name>/SKILL.md` or `.claude/skills/<name>/SKILL.md`.
 */
export function installSkillToDisk(skillName: string, targetBaseDir = '.agents/skills'): { installed: boolean; path: string; skill: BundledSkill } {
  const skill = BUNDLED_SKILLS[skillName];
  if (!skill) {
    throw new Error(`Unknown skill: "${skillName}". Available skills: ${Object.keys(BUNDLED_SKILLS).join(', ')}`);
  }

  const skillFolder = resolve(process.cwd(), targetBaseDir, skill.name);
  if (!existsSync(skillFolder)) {
    mkdirSync(skillFolder, { recursive: true });
  }

  const skillFilePath = join(skillFolder, 'SKILL.md');
  writeFileSync(skillFilePath, skill.content.trim() + '\n', 'utf-8');

  return {
    installed: true,
    path: skillFilePath,
    skill,
  };
}

/**
 * Registers all 8 bundled skills on an MCP Server as:
 * 1. MCP Resources (skill://glintbase/<name>)
 * 2. MCP Prompts (optimize_<name>)
 */
export function registerSkillPromptsAndResources(server: McpServer): void {
  for (const skill of Object.values(BUNDLED_SKILLS)) {
    // 1. Register Resource
    server.resource(
      `skill-${skill.name}`,
      skill.uri,
      async () => ({
        contents: [
          {
            uri: skill.uri,
            mimeType: 'text/markdown',
            text: skill.content,
          },
        ],
      })
    );

    // 2. Register Prompt
    server.prompt(
      `optimize-${skill.name}`,
      skill.description,
      {
        target: z.string().optional().describe('Target codebase directory or URL to optimize'),
      },
      async ({ target }) => ({
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Please use the "${skill.title}" skill guidelines below to optimize ${target || 'this project'}:\n\n${skill.content}`,
            },
          },
        ],
      })
    );
  }
}


/**
 * skills/agent-readiness/SKILL.md is the file-based copy of the bundled playbook
 * (for skills.sh / `npx skills add`). Its content must stay in step with the engine
 * copy in @glintbase/scanner-core, which the MCP servers serve.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUNDLED_SKILLS } from '@glintbase/scanner-core';

describe('SKILL.md stays in sync with scanner-core', () => {
  const skillMd = readFileSync(join(__dirname, '..', 'skills', 'agent-readiness', 'SKILL.md'), 'utf-8').replace(/\r\n/g, '\n');
  const engine = BUNDLED_SKILLS['glintbase-agent-readiness'];

  it('uses the engine playbook title and description', () => {
    expect(skillMd).toContain(`# ${engine.title}`);
    expect(skillMd).toContain(`description: ${engine.description}`);
  });

  it('contains every section and line of the engine playbook body', () => {
    const body = engine.content.replace(/\r\n/g, '\n').split(`# ${engine.title}`)[1] ?? '';
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
    expect(lines.length).toBeGreaterThan(5);
    for (const line of lines) expect(skillMd).toContain(line);
  });
});

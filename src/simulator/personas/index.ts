import { AgentPersona } from './base.js';
import { ClaudeCodePersona } from './claudeCode.js';
import { CursorPersona } from './cursor.js';
import { PerplexityPersona } from './perplexity.js';

export * from './base.js';
export * from './claudeCode.js';
export * from './cursor.js';
export * from './perplexity.js';

export function getPersona(name: string): AgentPersona {
  switch (name.toLowerCase()) {
    case 'cursor':
      return new CursorPersona();
    case 'perplexity':
      return new PerplexityPersona();
    case 'claude-code':
    case 'claude':
    default:
      return new ClaudeCodePersona();
  }
}

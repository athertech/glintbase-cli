import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { filterSlashCommands, BUILTIN_SLASH_COMMANDS } from '../src/output/promptBox.js';
import { getEffectiveModelInfo, autoDetectProvider, loadConfig, saveConfig, resetConfig } from '../src/config.js';

describe('Prompt Box & Slash Commands Autocomplete', () => {
  it('returns all commands when query is empty', () => {
    const all = filterSlashCommands('');
    expect(all.length).toBe(BUILTIN_SLASH_COMMANDS.length);
  });

  it('filters commands by prefix correctly', () => {
    const auditCmds = filterSlashCommands('/au');
    expect(auditCmds.length).toBe(1);
    expect(auditCmds[0].name).toBe('audit');

    const fixCmds = filterSlashCommands('/f');
    expect(fixCmds.some(c => c.name === 'fix')).toBe(true);

    const modelCmds = filterSlashCommands('model');
    expect(modelCmds.some(c => c.name === 'model')).toBe(true);
  });

  describe('Truthful Model & Provider Auto-Detection (Pi standard)', () => {
    const originalEnv = { ...process.env };
    let savedConfig: any;

    beforeEach(() => {
      savedConfig = loadConfig();
      resetConfig();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GROQ_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.OLLAMA_HOST;
      delete process.env.GLINTBASE_PROVIDER;
      delete process.env.GLINTBASE_MODEL;
    });

    afterEach(() => {
      resetConfig();
      saveConfig(savedConfig);
      process.env = { ...originalEnv };
    });

    it('honestly reports no model configured when no ambient keys exist', () => {
      const detected = autoDetectProvider();
      expect(detected.provider).toBeNull();

      const modelInfo = getEffectiveModelInfo({});
      expect(modelInfo.isConfigured).toBe(false);
      expect(modelInfo.displayName).toContain('None');
      expect(modelInfo.provider).toBeNull();
    });

    it('detects ambient Anthropic but requires explicit opt-in or --ai', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      const detected = autoDetectProvider();
      expect(detected.provider).toBe('anthropic');

      // Without explicit opt-in, session stays unconfigured
      const defaultInfo = getEffectiveModelInfo({});
      expect(defaultInfo.isConfigured).toBe(false);
      expect(defaultInfo.displayName).toContain('None');

      // With --ai flag or explicit opt-in, it activates
      const aiInfo = getEffectiveModelInfo({ ai: true });
      expect(aiInfo.isConfigured).toBe(true);
      expect(aiInfo.provider).toBe('anthropic');
      expect(aiInfo.model).toBeDefined();
    });

    it('detects ambient OpenAI but requires explicit opt-in or --ai', () => {
      process.env.OPENAI_API_KEY = 'sk-proj-test-key';
      const detected = autoDetectProvider();
      expect(detected.provider).toBe('openai');

      // Without explicit opt-in, session stays unconfigured
      const defaultInfo = getEffectiveModelInfo({});
      expect(defaultInfo.isConfigured).toBe(false);

      // With --ai flag, it activates
      const aiInfo = getEffectiveModelInfo({ ai: true });
      expect(aiInfo.isConfigured).toBe(true);
      expect(aiInfo.provider).toBe('openai');
      expect(aiInfo.model).toBe('gpt-4o');
    });
  });
});

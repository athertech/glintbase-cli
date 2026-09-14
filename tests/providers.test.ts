import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AnthropicProvider,
  OpenAIProvider,
  OllamaProvider,
  resolveModelProvider,
} from '../src/harness/providers/index.js';

describe('Model Provider Instantiation', () => {
  it('instantiates Anthropic provider with default and custom models', () => {
    const defaultProvider = new AnthropicProvider({ apiKey: 'test-key' });
    expect(defaultProvider.id).toBe('anthropic');
    expect(defaultProvider.model).toBe('claude-3-7-sonnet-20250219');

    const customProvider = new AnthropicProvider({
      apiKey: 'test-key',
      model: 'claude-3-5-haiku-20241022',
    });
    expect(customProvider.model).toBe('claude-3-5-haiku-20241022');
  });

  it('instantiates OpenAI provider with default and custom models', () => {
    const defaultProvider = new OpenAIProvider({ apiKey: 'test-key' });
    expect(defaultProvider.id).toBe('openai');
    expect(defaultProvider.model).toBe('gpt-4o');

    const customProvider = new OpenAIProvider({
      apiKey: 'test-key',
      model: 'o3-mini',
    });
    expect(customProvider.model).toBe('o3-mini');
  });

  it('instantiates Ollama provider with local endpoint', () => {
    const ollama = new OllamaProvider({
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'deepseek-r1:32b',
    });
    expect(ollama.id).toBe('ollama');
    expect(ollama.model).toBe('deepseek-r1:32b');
  });
});

import { resetConfig, loadConfig, saveConfig } from '../src/config.js';

describe('Model Provider Resolver', () => {
  const originalEnv = { ...process.env };
  let savedConfig: any;

  beforeEach(() => {
    savedConfig = loadConfig();
    resetConfig();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OLLAMA_HOST;
    delete process.env.GROQ_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetConfig();
    saveConfig(savedConfig);
  });

  it('resolves Anthropic when explicitly configured with key', () => {
    const result = resolveModelProvider({
      provider: 'anthropic',
      apiKey: 'sk-ant-test-123',
    });
    expect(result.providerId).toBe('anthropic');
    expect(result.provider).not.toBeNull();
    expect(result.source).toBe('flag');
  });

  it('resolves OpenAI when explicitly configured with key', () => {
    const result = resolveModelProvider({
      provider: 'openai',
      apiKey: 'sk-proj-test-123',
    });
    expect(result.providerId).toBe('openai');
    expect(result.provider).not.toBeNull();
    expect(result.source).toBe('flag');
  });

  it('resolves Ollama even without an API key (local offline)', () => {
    const result = resolveModelProvider({
      provider: 'ollama',
      model: 'qwen2.5-coder:7b',
    });
    expect(result.providerId).toBe('ollama');
    expect(result.model).toBe('qwen2.5-coder:7b');
    expect(result.provider).not.toBeNull();
  });

  it('auto-resolves from environment variables if no flag provided', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-env-123';
    const result = resolveModelProvider({});
    expect(result.providerId).toBe('anthropic');
    expect(result.source).toBe('env');
    expect(result.provider).not.toBeNull();
  });

  it('returns graceful error when provider is missing required key', () => {
    const result = resolveModelProvider({ provider: 'anthropic' });
    expect(result.provider).toBeNull();
    expect(result.error).toContain('ANTHROPIC_API_KEY is not set');
  });

  it('returns source none when no keys or providers are present', () => {
    const result = resolveModelProvider({});
    expect(result.provider).toBeNull();
    expect(result.source).toBe('none');
    expect(result.error).toBeDefined();
  });
});

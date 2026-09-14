/**
 * CLI config manager — ~/.glintbase/config.json
 * Resolution order: CLI flags > env vars > config file > defaults
 */

import Conf from 'conf';

export interface GlintbaseConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'groq' | 'ollama' | 'openrouter' | 'custom' | null;
  model: string | null;
  baseUrl: string | null;
  apiKey: string | null;
  firecrawlKey: string | null;
  scan: {
    profile: 'quick' | 'deep';
    maxPages: number;
    failUnder: number | null;
  };
}

export interface ResolvedConfig {
  provider: string | null;
  model: string | null;
  baseUrl: string | null;
  apiKey: string | null;
  firecrawlKey: string | null;
  profile: 'quick' | 'deep';
  maxPages: number;
  failUnder: number | null;
  useAgentHarness: boolean;
}

const DEFAULTS: GlintbaseConfig = {
  provider: null,
  model: null,
  baseUrl: null,
  apiKey: null,
  firecrawlKey: null,
  scan: {
    profile: 'quick',
    maxPages: 30,
    failUnder: null,
  },
};

const store = new Conf<GlintbaseConfig>({
  projectName: 'glintbase',
  defaults: DEFAULTS,
});

export function loadConfig(): GlintbaseConfig {
  return {
    provider: store.get('provider'),
    model: store.get('model'),
    baseUrl: store.get('baseUrl'),
    apiKey: store.get('apiKey'),
    firecrawlKey: store.get('firecrawlKey'),
    scan: store.get('scan'),
  };
}

export function saveConfig(config: Partial<GlintbaseConfig>): void {
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) {
      store.delete(key as keyof GlintbaseConfig);
    } else {
      store.set(key as keyof GlintbaseConfig, value as any);
    }
  }
}

export function configExists(): boolean {
  return store.get('provider') !== null || store.get('apiKey') !== null;
}

export function getConfigPath(): string {
  return store.path;
}

export function resetConfig(): void {
  store.clear();
}

/**
 * Auto-detect provider from ambient environment credentials (Pi harness convention).
 * Used for suggestion / detection display, but NOT silently bound without explicit configuration.
 */
export function autoDetectProvider(): { provider: GlintbaseConfig['provider']; source: 'env' | 'none' } {
  loadAmbientEnvFiles();
  if (process.env.ANTHROPIC_API_KEY) return { provider: 'anthropic', source: 'env' };
  if (process.env.OPENAI_API_KEY) return { provider: 'openai', source: 'env' };
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
    return { provider: 'google', source: 'env' };
  }
  if (process.env.GROQ_API_KEY) return { provider: 'groq', source: 'env' };
  if (process.env.OPENROUTER_API_KEY) return { provider: 'openrouter', source: 'env' };
  if (process.env.OLLAMA_HOST) return { provider: 'ollama', source: 'env' };
  return { provider: null, source: 'none' };
}

export function getAmbientDetectedKeys(): string[] {
  const keys: string[] = [];
  if (process.env.ANTHROPIC_API_KEY) keys.push('ANTHROPIC_API_KEY (Anthropic)');
  if (process.env.OPENAI_API_KEY) keys.push('OPENAI_API_KEY (OpenAI)');
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
    keys.push('GEMINI_API_KEY (Google)');
  }
  if (process.env.GROQ_API_KEY) keys.push('GROQ_API_KEY (Groq)');
  if (process.env.OPENROUTER_API_KEY) keys.push('OPENROUTER_API_KEY (OpenRouter)');
  if (process.env.OLLAMA_HOST) keys.push('OLLAMA_HOST (Ollama Local)');
  return keys;
}

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Load ambient environment files (.env, .env.local) if present.
 * Skipped automatically in test environments.
 */
export function loadAmbientEnvFiles(cwd: string = process.cwd()): void {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return;
  const candidates = [
    join(cwd, '.env.local'),
    join(cwd, '.env'),
    join(cwd, '..', '.env.local'),
    join(cwd, '..', '.env'),
    join(cwd, '..', 'glintscanner', '.env.local'),
    join(cwd, 'glintscanner', '.env.local'),
  ];

  for (const filePath of candidates) {
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        for (const rawLine of content.split('\n')) {
          const line = rawLine.trim();
          if (!line || line.startsWith('#')) continue;
          const eqIdx = line.indexOf('=');
          if (eqIdx <= 0) continue;
          const key = line.slice(0, eqIdx).trim();
          let val = line.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      } catch {
        /* ignore parse errors */
      }
    }
  }
}

export interface EffectiveModelInfo {
  provider: string | null;
  model: string | null;
  displayName: string;
  isConfigured: boolean;
  apiKey?: string | null;
  baseUrl?: string | null;
  source: 'flag' | 'env' | 'config' | 'none';
  keySource?: string;
}

export function getEffectiveModelInfo(flags: Record<string, any> = {}): EffectiveModelInfo {
  const cfg = resolveConfig(flags);
  if (!cfg.provider || !cfg.isExplicitlyConfigured) {
    return {
      provider: null,
      model: null,
      displayName: 'None (Offline AST & Probes Engine)',
      isConfigured: false,
      apiKey: null,
      baseUrl: null,
      source: 'none',
    };
  }

  const keyDetail = cfg.keySource ? ` [${cfg.keySource}]` : '';
  return {
    provider: cfg.provider,
    model: cfg.model,
    displayName: cfg.model ? `${cfg.model} (${cfg.provider})${keyDetail}` : `${cfg.provider}${keyDetail}`,
    isConfigured: true,
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl,
    source: cfg.source,
    keySource: cfg.keySource,
  };
}

export interface ResolvedConfig {
  provider: string | null;
  model: string | null;
  baseUrl: string | null;
  apiKey: string | null;
  firecrawlKey: string | null;
  profile: 'quick' | 'deep';
  maxPages: number;
  failUnder: number | null;
  useAgentHarness: boolean;
  isExplicitlyConfigured: boolean;
  source: 'flag' | 'env' | 'config' | 'none';
  keySource?: string;
}

/**
 * Resolve final config:
 * 1. CLI flags (--provider, --model, --offline)
 * 2. GLINTBASE_PROVIDER / GLINTBASE_MODEL environment variables
 * 3. ~/.glintbase/config.json stored preferences
 * 4. Ambient environment variables (require --ai, --agent, or explicit config opt-in)
 */
export function resolveConfig(flags: Record<string, any> = {}): ResolvedConfig {
  loadAmbientEnvFiles();
  const fileConfig = loadConfig();
  const detected = autoDetectProvider();

  // If user passes --offline or --no-ai, run strictly deterministic
  const isOffline = Boolean(flags.offline || flags.noAi);

  const explicitProvider = flags.provider
    || process.env.GLINTBASE_PROVIDER
    || fileConfig.provider
    || ((flags.ai || flags.agent) ? detected.provider : null);

  const isExplicitlyConfigured = Boolean(
    flags.provider
    || process.env.GLINTBASE_PROVIDER
    || fileConfig.provider
    || ((flags.ai || flags.agent) && detected.provider)
  );

  let provider: string | null = null;
  let source: 'flag' | 'env' | 'config' | 'none' = 'none';
  let keySource: string | undefined;

  if (!isOffline && isExplicitlyConfigured && explicitProvider) {
    provider = explicitProvider;
    if (flags.provider) source = 'flag';
    else if (process.env.GLINTBASE_PROVIDER) source = 'env';
    else if (fileConfig.provider) source = 'config';
    else if (detected.provider) source = 'env';
  }

  const model = flags.model
    || process.env.GLINTBASE_MODEL
    || fileConfig.model
    || (provider ? getEnvModel(provider) : null)
    || (provider ? getDefaultModel(provider) : null);

  const baseUrl = flags.baseUrl
    || process.env.GLINTBASE_BASE_URL
    || fileConfig.baseUrl
    || (provider ? getDefaultBaseUrl(provider) : null);

  const apiKey = flags.apiKey
    || (provider ? getEnvApiKey(provider) : null)
    || fileConfig.apiKey
    || null;

  if (source === 'env' && provider) {
    keySource = getEnvKeyName(provider);
  } else if (source === 'config') {
    keySource = fileConfig.apiKey ? 'config.json:apiKey' : getEnvKeyName(provider);
  } else if (source === 'flag') {
    keySource = flags.apiKey ? '--apiKey' : getEnvKeyName(provider);
  }

  const firecrawlKey = flags.firecrawlKey
    || process.env.FIRECRAWL_API_KEY
    || fileConfig.firecrawlKey
    || null;

  const profile = flags.profile || fileConfig.scan?.profile || 'quick';
  const maxPages = flags.maxPages || fileConfig.scan?.maxPages || 30;
  const failUnder = flags.failUnder ?? fileConfig.scan?.failUnder ?? null;

  return {
    provider,
    model,
    baseUrl,
    apiKey,
    firecrawlKey,
    profile,
    maxPages,
    failUnder,
    useAgentHarness: Boolean(isExplicitlyConfigured && provider),
    isExplicitlyConfigured,
    source,
    keySource,
  };
}

function getEnvKeyName(provider: string | null): string {
  switch (provider) {
    case 'openai': return 'OPENAI_API_KEY';
    case 'anthropic': return 'ANTHROPIC_API_KEY';
    case 'google': return 'GEMINI_API_KEY';
    case 'groq': return 'GROQ_API_KEY';
    case 'openrouter': return 'OPENROUTER_API_KEY';
    case 'ollama': return 'OLLAMA_HOST';
    default: return 'env';
  }
}

function getDefaultModel(provider: string | null): string | null {
  switch (provider) {
    case 'ollama': return 'qwen2.5-coder:32b';
    case 'openai': return 'gpt-4o';
    case 'anthropic': return 'claude-3-7-sonnet-20250219';
    case 'google': return 'gemini-2.0-flash';
    case 'groq': return 'openai/gpt-oss-120b';
    case 'openrouter': return 'openai/gpt-4o';
    default: return null;
  }
}

function getDefaultBaseUrl(provider: string | null): string | null {
  switch (provider) {
    case 'ollama': return 'http://localhost:11434/v1';
    case 'openrouter': return 'https://openrouter.ai/api/v1';
    default: return null;
  }
}

function getEnvModel(provider: string | null): string | null {
  switch (provider) {
    case 'groq': return process.env.GROQ_MODEL || null;
    case 'openai': return process.env.OPENAI_MODEL || null;
    case 'anthropic': return process.env.ANTHROPIC_MODEL || null;
    case 'google': return process.env.GEMINI_MODEL || process.env.GOOGLE_MODEL || null;
    case 'ollama': return process.env.OLLAMA_MODEL || null;
    case 'openrouter': return process.env.OPENROUTER_MODEL || null;
    default: return null;
  }
}

function getEnvApiKey(provider: string | null): string | null {
  switch (provider) {
    case 'openai': return process.env.OPENAI_API_KEY || null;
    case 'anthropic': return process.env.ANTHROPIC_API_KEY || null;
    case 'google': return process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || null;
    case 'groq': return process.env.GROQ_API_KEY || null;
    case 'openrouter': return process.env.OPENROUTER_API_KEY || null;
    default: return null;
  }
}

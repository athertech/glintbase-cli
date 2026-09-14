/**
 * Provider Resolver for Glintbase Agent Harness.
 * Selects and instantiates the optimal ModelProvider based on
 * CLI flags, config store, environment variables, or local daemon probing.
 */

import type { ModelProvider, ModelProviderOptions } from './interface.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { OllamaProvider } from './ollama.js';
import { GroqProvider } from './groq.js';
import { GoogleProvider } from './google.js';
import { loadConfig, type ResolvedConfig } from '../../config.js';

export interface ProviderResolutionResult {
  provider: ModelProvider | null;
  providerId: string;
  model: string;
  source: 'flag' | 'config' | 'env' | 'auto' | 'none';
  error?: string;
}

export function resolveModelProvider(config?: Partial<ResolvedConfig>): ProviderResolutionResult {
  const fileConfig = loadConfig();
  const explicitProvider = config?.provider?.toLowerCase() || (config ? undefined : fileConfig.provider?.toLowerCase());
  const explicitModel = config?.model || (config ? undefined : fileConfig.model);
  const explicitApiKey = config?.apiKey || fileConfig.apiKey;
  const explicitBaseUrl = config?.baseUrl || fileConfig.baseUrl;

  const commonOptions: ModelProviderOptions = {
    apiKey: explicitApiKey || undefined,
    baseUrl: explicitBaseUrl || undefined,
    model: explicitModel || undefined,
  };

  // 1. Explicitly requested provider
  if (explicitProvider) {
    if (explicitProvider === 'groq') {
      const apiKey = explicitApiKey || process.env.GROQ_API_KEY;
      if (!apiKey) {
        return {
          provider: null,
          providerId: 'groq',
          model: explicitModel || 'openai/gpt-oss-120b',
          source: 'flag',
          error: 'Groq provider selected but GROQ_API_KEY is not set.',
        };
      }
      return {
        provider: new GroqProvider({ ...commonOptions, apiKey, model: explicitModel || 'openai/gpt-oss-120b' }),
        providerId: 'groq',
        model: explicitModel || 'openai/gpt-oss-120b',
        source: 'flag',
      };
    }

    if (explicitProvider === 'google' || explicitProvider === 'gemini') {
      const apiKey = explicitApiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return {
          provider: null,
          providerId: 'google',
          model: explicitModel || 'gemini-2.0-flash',
          source: 'flag',
          error: 'Google provider selected but GOOGLE_API_KEY is not set.',
        };
      }
      return {
        provider: new GoogleProvider({ ...commonOptions, apiKey, model: explicitModel || 'gemini-2.0-flash' }),
        providerId: 'google',
        model: explicitModel || 'gemini-2.0-flash',
        source: 'flag',
      };
    }

    if (explicitProvider === 'anthropic') {
      const apiKey = explicitApiKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return {
          provider: null,
          providerId: 'anthropic',
          model: explicitModel || 'claude-3-7-sonnet-20250219',
          source: 'flag',
          error: 'Anthropic provider selected but ANTHROPIC_API_KEY is not set.',
        };
      }
      return {
        provider: new AnthropicProvider({ ...commonOptions, apiKey, model: explicitModel || 'claude-3-7-sonnet-20250219' }),
        providerId: 'anthropic',
        model: explicitModel || 'claude-3-7-sonnet-20250219',
        source: 'flag',
      };
    }

    if (explicitProvider === 'openai') {
      const apiKey = explicitApiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return {
          provider: null,
          providerId: 'openai',
          model: explicitModel || 'gpt-4o',
          source: 'flag',
          error: 'OpenAI provider selected but OPENAI_API_KEY is not set.',
        };
      }
      return {
        provider: new OpenAIProvider({ ...commonOptions, apiKey, model: explicitModel || 'gpt-4o' }),
        providerId: 'openai',
        model: explicitModel || 'gpt-4o',
        source: 'flag',
      };
    }

    if (explicitProvider === 'ollama' || explicitProvider === 'vllm' || explicitProvider === 'custom') {
      return {
        provider: new OllamaProvider({ ...commonOptions, model: explicitModel || 'qwen2.5-coder:32b' }),
        providerId: explicitProvider,
        model: explicitModel || 'qwen2.5-coder:32b',
        source: 'flag',
      };
    }
  }

  // 2. Auto-detect from Environment Variables
  if (process.env.GROQ_API_KEY) {
    return {
      provider: new GroqProvider(commonOptions),
      providerId: 'groq',
      model: explicitModel || 'openai/gpt-oss-120b',
      source: 'env',
    };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: new AnthropicProvider(commonOptions),
      providerId: 'anthropic',
      model: explicitModel || 'claude-3-7-sonnet-20250219',
      source: 'env',
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: new OpenAIProvider(commonOptions),
      providerId: 'openai',
      model: explicitModel || 'gpt-4o',
      source: 'env',
    };
  }

  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
    return {
      provider: new GoogleProvider(commonOptions),
      providerId: 'google',
      model: explicitModel || 'gemini-2.0-flash',
      source: 'env',
    };
  }

  if (process.env.OLLAMA_HOST) {
    return {
      provider: new OllamaProvider(commonOptions),
      providerId: 'ollama',
      model: explicitModel || 'qwen2.5-coder:32b',
      source: 'env',
    };
  }

  // 3. Fallback: Default to local Ollama if offline execution is desired
  return {
    provider: null,
    providerId: 'none',
    model: 'none',
    source: 'none',
    error: 'No AI model provider configured. Connect with `/connect` or set API keys.',
  };
}

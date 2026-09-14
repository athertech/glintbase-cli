/**
 * CLI Command: glintbase connect
 * Interactive model provider connection wizard (Pi & OpenCode standard).
 * Allows users to choose their active AI provider, verify credentials,
 * and persist them to ~/.glintbase/config.json without silent ambient assumptions.
 */

import { Command } from 'commander';
import pc from 'picocolors';
import prompts from 'prompts';
import { loadConfig, saveConfig, getAmbientDetectedKeys } from '../config.js';
import { brand } from '../output/banner.js';

export interface ConnectResult {
  provider: string | null;
  model: string | null;
  apiKey?: string | null;
  baseUrl?: string | null;
  mode: 'connected' | 'offline' | 'cancelled';
  message: string;
}

export const DEFAULT_MODELS: Record<string, string> = {
  groq: 'openai/gpt-oss-120b',
  anthropic: 'claude-3-7-sonnet-20250219',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
  ollama: 'qwen2.5-coder:32b',
};

export const PROVIDER_OPTIONS = [
  {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-fast inference (GPT-OSS 120B, Qwen 3.6)',
    defaultModel: 'openai/gpt-oss-120b',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 3.7 Sonnet, Claude 3.5 Haiku',
    defaultModel: 'claude-3-7-sonnet-20250219',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, o3-mini',
    defaultModel: 'gpt-4o',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    description: 'Gemini 2.0 Flash / Pro',
    defaultModel: 'gemini-2.0-flash',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local offline models (http://localhost:11434)',
    defaultModel: 'qwen2.5-coder:32b',
  },
  {
    id: 'offline',
    name: 'None (Offline AST & Probes Engine)',
    description: 'Deterministic codebase inspection with 0 external API calls',
    defaultModel: '',
  },
];

export function getAmbientKeyForProvider(provider: string): string | undefined {
  switch (provider.toLowerCase()) {
    case 'groq':
      return process.env.GROQ_API_KEY;
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY;
    case 'openai':
      return process.env.OPENAI_API_KEY;
    case 'google':
    case 'gemini':
      return process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    default:
      return undefined;
  }
}

export async function runConnectWizard(): Promise<ConnectResult> {
  console.log('');
  console.log(pc.cyan(`╭─  ${pc.bold('CONNECT AI MODEL PROVIDER')}  ──────────────────────────────────╮`));
  console.log(pc.cyan('│') + pc.dim('  Configure your primary intelligence provider or switch to offline mode'.padEnd(76, ' ')) + pc.cyan('│'));
  console.log(pc.cyan(`╰─────────────────────────────────────────────────────────────────────────────╯\n`));

  const ambient = getAmbientDetectedKeys();
  if (ambient.length > 0) {
    console.log(`  ${pc.yellow('ℹ')} Ambient credentials found in your environment:`);
    for (const k of ambient) {
      console.log(`    • ${pc.cyan(k)}`);
    }
    console.log('');
  }

  const current = loadConfig();

  const response = await prompts({
    type: 'select',
    name: 'choice',
    message: 'Select an AI provider for the Glintbase Agent Harness:',
    choices: PROVIDER_OPTIONS.map(opt => ({
      title: `${brand.orange(opt.name)}`,
      description: opt.description,
      value: opt.id,
    })),
    initial: 0,
  });

  if (!response.choice) {
    return {
      provider: current.provider,
      model: current.model,
      mode: 'cancelled',
      message: 'Connection configuration cancelled.',
    };
  }

  if (response.choice === 'offline') {
    saveConfig({ provider: null, model: null, apiKey: null });
    console.log(pc.green('\n  ✓ Active model reset to Offline AST & Probes Engine.\n'));
    return {
      provider: null,
      model: null,
      mode: 'offline',
      message: 'Reset to Offline AST & Probes Engine.',
    };
  }

  if (response.choice === 'ollama') {
    const ollamaDetails = await prompts([
      {
        type: 'text',
        name: 'model',
        message: 'Ollama model tag:',
        initial: current.model || 'qwen2.5-coder:32b',
      },
      {
        type: 'text',
        name: 'baseUrl',
        message: 'Ollama API Base URL:',
        initial: current.baseUrl || 'http://localhost:11434/v1',
      },
    ]);

    if (!ollamaDetails.model) {
      return { provider: current.provider, model: current.model, mode: 'cancelled', message: 'Cancelled.' };
    }

    saveConfig({
      provider: 'ollama',
      model: ollamaDetails.model,
      baseUrl: ollamaDetails.baseUrl,
      apiKey: 'ollama-local',
    });

    console.log(pc.green(`\n  ✓ Connected to Ollama (${ollamaDetails.model}) at ${ollamaDetails.baseUrl}\n`));
    return {
      provider: 'ollama',
      model: ollamaDetails.model,
      baseUrl: ollamaDetails.baseUrl,
      mode: 'connected',
      message: `Connected to Ollama (${ollamaDetails.model})`,
    };
  }

  // Cloud API Providers (Anthropic, OpenAI, Google, Groq)
  const provider = response.choice;
  const envKeyMap: Record<string, string | undefined> = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    google: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
    groq: process.env.GROQ_API_KEY,
  };

  const defaultModels: Record<string, string> = {
    anthropic: 'claude-3-7-sonnet-20250219',
    openai: 'gpt-4o',
    google: 'gemini-2.0-flash',
    groq: 'openai/gpt-oss-120b',
  };

  const ambientKey = envKeyMap[provider];

  const keyPrompt = await prompts([
    {
      type: 'password',
      name: 'apiKey',
      message: ambientKey
        ? `Enter ${provider.toUpperCase()} API Key (press Enter to use ambient env key):`
        : `Enter ${provider.toUpperCase()} API Key:`,
      initial: ambientKey ? '(ambient env key)' : '',
    },
    {
      type: 'text',
      name: 'model',
      message: 'Model identifier:',
      initial: (current.provider === provider && current.model) ? current.model : defaultModels[provider],
    },
  ]);

  const finalKey = keyPrompt.apiKey === '(ambient env key)'
    ? ambientKey
    : (keyPrompt.apiKey || ambientKey);

  if (!finalKey) {
    console.log(pc.red('\n  ✗ No API key provided. Provider was not configured.\n'));
    return {
      provider: current.provider,
      model: current.model,
      mode: 'cancelled',
      message: 'API Key missing.',
    };
  }

  saveConfig({
    provider,
    model: keyPrompt.model,
    apiKey: finalKey,
  });

  console.log(pc.green(`\n  ✓ Successfully connected to ${provider} (${keyPrompt.model})!\n`));
  return {
    provider,
    model: keyPrompt.model,
    apiKey: finalKey,
    mode: 'connected',
    message: `Connected to ${provider} (${keyPrompt.model})`,
  };
}

export const connectCommand = new Command('connect')
  .description('Connect and configure an AI model provider (Groq, Anthropic, OpenAI, Ollama, Gemini)')
  .argument('[provider]', 'Provider ID (groq, anthropic, openai, google, ollama, offline)')
  .argument('[apiKey]', 'API key for the provider (or "ambient" / "keep")')
  .argument('[model]', 'Model identifier')
  .action(async (provider?: string, apiKey?: string, model?: string) => {
    if (provider) {
      const lower = provider.toLowerCase();
      if (lower === 'offline' || lower === 'none') {
        saveConfig({ provider: null, model: null, apiKey: null });
        console.log(pc.green('\n  ✔ Reset active model to Offline AST & Probes Engine.\n'));
        return;
      }

      const keyToUse = (apiKey && apiKey !== 'ambient' && apiKey !== 'keep')
        ? apiKey
        : getAmbientKeyForProvider(lower);

      const modelToUse = model || DEFAULT_MODELS[lower] || 'default';

      saveConfig({
        provider: lower as any,
        apiKey: keyToUse || null,
        model: modelToUse,
      });

      console.log(pc.green(`\n  ✔ Configured ${pc.bold(lower)} (${modelToUse})`));
      if (keyToUse) {
        console.log(pc.dim('    API Key saved successfully.'));
      } else {
        console.log(pc.yellow('    Warning: No API key provided or detected in ambient environment.'));
      }
      console.log('');
      return;
    }

    await runConnectWizard();
  });


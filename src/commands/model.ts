/**
 * CLI Command: glintbase model [provider/model]
 * Inspect or select the active AI model provider (Pi harness style).
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { getEffectiveModelInfo, autoDetectProvider, saveConfig, loadConfig } from '../config.js';
import { brand, stripAnsi } from '../output/banner.js';

export interface ParsedModelTarget {
  provider: string;
  model: string | null;
}

/**
 * Parse a model configuration target string intelligently (Pi & OpenCode standard).
 * Supports:
 * - Direct provider: "groq", "anthropic", "openai"
 * - Provider + Model: "groq/llama-3.3-70b-versatile", "anthropic:claude-3-7-sonnet"
 * - Models with slashes: "qwen/qwen3.6-27b", "groq/qwen/qwen3.6-27b", "meta-llama/llama-3.3-70b-versatile"
 * - Model heuristics: "claude-3-7-sonnet", "gpt-4o", "gemini-2.0-flash"
 */
export function parseModelTarget(target: string, currentProvider?: string | null): ParsedModelTarget {
  const validProviders = ['anthropic', 'openai', 'ollama', 'google', 'gemini', 'groq', 'openrouter', 'custom'];
  const trimmed = target.trim();
  if (!trimmed) {
    return { provider: currentProvider || 'groq', model: null };
  }

  // 1. Explicit provider prefix with colon, slash, or space:
  // e.g. "groq/qwen/qwen3.6-27b", "groq:llama-3.3-70b-versatile", "anthropic claude-3-7-sonnet"
  const prefixMatch = trimmed.match(/^([a-zA-Z0-9_-]+)[:\/\s](.+)$/);
  if (prefixMatch && validProviders.includes(prefixMatch[1].toLowerCase())) {
    const rawProv = prefixMatch[1].toLowerCase();
    const provider = rawProv === 'gemini' ? 'google' : rawProv;
    return { provider, model: prefixMatch[2].trim() };
  }

  // 2. Just a provider name alone: e.g. "anthropic", "openai", "groq"
  if (validProviders.includes(trimmed.toLowerCase())) {
    const rawProv = trimmed.toLowerCase();
    const provider = rawProv === 'gemini' ? 'google' : rawProv;
    return { provider, model: null };
  }

  // 3. Known model family heuristics:
  if (trimmed.startsWith('claude-')) {
    return { provider: 'anthropic', model: trimmed };
  }
  if (trimmed.startsWith('gpt-') || trimmed.startsWith('o1-') || trimmed.startsWith('o3-')) {
    return { provider: 'openai', model: trimmed };
  }
  if (trimmed.startsWith('gemini-')) {
    return { provider: 'google', model: trimmed };
  }

  // 4. Preserve current provider (or default to 'groq') and treat target as model name
  // Handles "qwen/qwen3.6-27b", "meta-llama/llama-3.3-70b-versatile", etc.
  return {
    provider: currentProvider || 'groq',
    model: trimmed,
  };
}

export const modelCommand = new Command('model')
  .description('Inspect or configure active AI model provider')
  .argument('[target]', 'Model target formatted as <provider>, <provider/model>, <model>, test, or offline')
  .action(async (target?: string) => {
    const fileConfig = loadConfig();

    if (!target) {
      // Show current status and available providers
      const modelInfo = getEffectiveModelInfo();
      const detected = autoDetectProvider();

      const innerWidth = 74;
      const padLine = (content: string) => {
        const visLen = stripAnsi(content).length;
        return content + ' '.repeat(Math.max(0, innerWidth - visLen));
      };

      console.log('');
      console.log(brand.border('╭─ ') + brand.orangeBold('GLINTBASE MODEL CONFIGURATION') + brand.border(' ' + '─'.repeat(innerWidth - 30) + '╮'));
      console.log(brand.border('│') + padLine(`  ${pc.dim('Active Model :')} ${pc.bold(modelInfo.isConfigured ? pc.green(modelInfo.displayName) : pc.yellow('None (Offline AST & Probes Engine)'))}`) + brand.border('│'));
      console.log(brand.border('│') + padLine(`  ${pc.dim('Ambient Env  :')} ${detected.provider ? pc.cyan(`${detected.provider} API key detected`) : pc.dim('No API keys found in environment')}`) + brand.border('│'));
      console.log(brand.border('│') + padLine(`  ${pc.dim('Stored Config:')} ${fileConfig.provider ? pc.cyan(`${fileConfig.provider} (${fileConfig.model || 'default'})`) : pc.dim('(none)')}`) + brand.border('│'));
      console.log(brand.border('╰─' + '─'.repeat(innerWidth) + '╯'));
      console.log('');
      console.log(pc.bold('  Supported Providers:'));
      console.log(`    ${brand.orange('groq')}       · Ultra-fast open models (qwen/qwen3.6-27b, llama-3.3-70b-versatile)`);
      console.log(`    ${brand.orange('anthropic')}  · Claude 3.7 Sonnet, Claude 3.5 Haiku (needs ANTHROPIC_API_KEY)`);
      console.log(`    ${brand.orange('openai')}     · GPT-4o, o3-mini (needs OPENAI_API_KEY)`);
      console.log(`    ${brand.orange('ollama')}     · Local offline models (e.g. qwen2.5-coder:32b, deepseek-r1)`);
      console.log(`    ${brand.orange('google')}     · Gemini 2.0 Flash (needs GOOGLE_API_KEY)`);
      console.log('');
      console.log(pc.dim('  Test connection : ') + pc.cyan('glintbase model test'));
      console.log(pc.dim('  Set model target: ') + pc.cyan('glintbase model claude-3-7-sonnet') + pc.dim(' or ') + pc.cyan('glintbase model groq/llama-3.3-70b-versatile'));
      console.log(pc.dim('  Force offline   : ') + pc.cyan('glintbase model offline') + '\n');
      return;
    }

    if (target === 'test' || target === 'status') {
      const { resolveModelProvider } = await import('../harness/providers/resolver.js');
      const modelInfo = getEffectiveModelInfo();
      console.log(`\n  ${pc.bold('Testing active model connection...')}`);
      console.log(`  ${pc.dim('Model:')} ${pc.cyan(modelInfo.displayName)}`);

      const res = resolveModelProvider();
      if (!res.provider) {
        console.log(pc.yellow(`\n  ⚠ No active AI provider connected: ${res.error || 'Running in offline AST mode'}`));
        console.log(pc.dim('  Connect via `glintbase model <provider>` or export ANTHROPIC_API_KEY / OPENAI_API_KEY.\n'));
        return;
      }

      const t0 = Date.now();
      try {
        const reply = await res.provider.generateText('Respond with "ok"');
        const latency = Date.now() - t0;
        console.log(pc.green(`\n  ✔ Connection verified successfully!`));
        console.log(`  ${pc.dim('Provider:')} ${pc.bold(res.provider.name)}`);
        console.log(`  ${pc.dim('Model   :')} ${pc.bold(res.provider.model)}`);
        console.log(`  ${pc.dim('Latency :')} ${pc.green(`${latency}ms`)}`);
        console.log(`  ${pc.dim('Echo    :')} ${pc.dim(reply.trim())}\n`);
      } catch (err: any) {
        const latency = Date.now() - t0;
        console.log(pc.red(`\n  ✕ Model connection failed (${latency}ms)`));
        console.log(`  ${pc.red(err?.message || String(err))}\n`);
      }
      return;
    }

    if (target === 'offline' || target === 'reset') {
      saveConfig({ provider: null as any, model: null, apiKey: null });
      console.log(pc.green('\n  ✔ Switched to offline deterministic mode (no LLM calls will be made).\n'));
      return;
    }

    const { provider, model } = parseModelTarget(target, fileConfig.provider);

    saveConfig({ provider: provider as any, model });
    console.log(pc.green(`\n  ✔ Set active provider to ${pc.bold(provider)}${model ? ` (model: ${model})` : ''}`));
    console.log(pc.dim('  Run `glintbase model test` to verify API connection.\n'));
  });


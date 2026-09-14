/**
 * Universal Model Provider Interface for Glintbase Agent Harness.
 * Provides a standardized abstraction for LLM interactions across
 * Anthropic, OpenAI, local Ollama/vLLM, and other AI SDK backends.
 */

import type { z } from 'zod';

export interface ModelProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelProvider {
  readonly id: string;
  readonly name: string;
  readonly model: string;

  /**
   * Generate completion text from prompt and optional system prompt.
   */
  generateText(prompt: string, systemPrompt?: string): Promise<string>;

  /**
   * Generate structured object validated against a Zod schema.
   */
  generateObject<T>(prompt: string, schema: z.ZodType<T>, systemPrompt?: string): Promise<T>;

  /**
   * Stream text response with delta callback and complete accumulated string return.
   */
  streamText(prompt: string, systemPrompt?: string, onDelta?: (delta: string) => void): Promise<string>;

  /**
   * Retrieve the underlying Vercel AI SDK LanguageModel instance for tool calling.
   */
  getLanguageModel?(): any;
}

/**
 * Inoculate all background PromiseLike properties on a StreamTextResult object.
 * In Vercel AI SDK, streamText exposes background promises (text, reasoning, files, response, usage, etc.).
 * If an API request fails (e.g. 429 rate limit or network error), any unconsumed promise will reject
 * in the Node.js event loop, causing UnhandledPromiseRejection errors that write raw stack traces
 * to stderr and corrupt alternate screen buffers.
 */
export function suppressStreamResultRejections(result: any): void {
  if (!result || typeof result !== 'object') return;
  const promiseKeys = [
    'content', 'text', 'reasoning', 'reasoningText', 'files', 'sources',
    'toolCalls', 'staticToolCalls', 'dynamicToolCalls', 'staticToolResults',
    'dynamicToolResults', 'toolResults', 'finishReason', 'rawFinishReason',
    'usage', 'warnings', 'request', 'response', 'steps'
  ];
  for (const key of promiseKeys) {
    try {
      const p = result[key];
      if (p && typeof p.then === 'function' && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    } catch (_) {}
  }
}

/**
 * Groq Model Provider Adapter (Llama 3.3, Llama 3.1, Qwen 2.5)
 * Ultra-fast token inference via @ai-sdk/groq.
 */

import { createGroq } from '@ai-sdk/groq';
import { generateText, generateObject, streamText } from 'ai';
import type { z } from 'zod';
import type { ModelProvider, ModelProviderOptions } from './interface.js';
import { suppressStreamResultRejections } from './interface.js';

export class GroqProvider implements ModelProvider {
  public readonly id = 'groq';
  public readonly name = 'Groq';
  public readonly model: string;

  private client: ReturnType<typeof createGroq>;
  private options: ModelProviderOptions;

  constructor(options: ModelProviderOptions = {}) {
    this.options = options;
    // Default to GPT-OSS 120B (active flagship open-weights on Groq) or specified model
    this.model = options.model || 'openai/gpt-oss-120b';
    this.client = createGroq({
      apiKey: options.apiKey || process.env.GROQ_API_KEY,
      baseURL: options.baseUrl,
    });
  }

  /**
   * Determine safe maxOutputTokens budget for Groq models.
   * On Groq on-demand / free tier:
   * - Qwen models (e.g. qwen/qwen3.6-27b) strictly enforce 1000 OTPM (output tokens per minute).
   *   Requesting 4096 causes an immediate HTTP 429: "Limit 1000, Requested 4096".
   *   Setting to 800 strictly prevents this error and keeps streaming reliable.
   * - Llama-3.3 / Llama-3.1 work reliably with 2048 tokens.
   */
  private getSafeMaxTokens(): number {
    const isQwen = this.model.toLowerCase().includes('qwen');
    const ceiling = isQwen ? 800 : 2048;
    if (this.options.maxTokens) {
      return Math.min(this.options.maxTokens, ceiling);
    }
    return ceiling;
  }

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const result = await generateText({
      model: this.client(this.model),
      system: systemPrompt,
      prompt,
      temperature: this.options.temperature ?? 0.2,
      maxOutputTokens: this.getSafeMaxTokens(),
      maxRetries: 0,
    });
    return result.text;
  }

  async generateObject<T>(prompt: string, schema: z.ZodType<T>, systemPrompt?: string): Promise<T> {
    const result = await generateObject({
      model: this.client(this.model),
      system: systemPrompt,
      prompt,
      schema,
      temperature: this.options.temperature ?? 0.2,
      maxOutputTokens: this.getSafeMaxTokens(),
      maxRetries: 0,
    });
    return result.object as T;
  }

  async streamText(prompt: string, systemPrompt?: string, onDelta?: (delta: string) => void): Promise<string> {
    const result = streamText({
      model: this.client(this.model),
      system: systemPrompt,
      prompt,
      temperature: this.options.temperature ?? 0.2,
      maxOutputTokens: this.getSafeMaxTokens(),
      maxRetries: 0,
    });

    // Inoculate all background promise properties on result against unhandled rejections
    suppressStreamResultRejections(result);

    let fullText = '';
    for await (const delta of result.textStream) {
      fullText += delta;
      if (onDelta) {
        onDelta(delta);
      }
    }
    return fullText;
  }

  getLanguageModel(): any {
    return this.client(this.model);
  }
}


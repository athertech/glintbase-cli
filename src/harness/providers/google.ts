/**
 * Google Gemini Model Provider Adapter (Gemini 2.0 Flash / Pro)
 * High speed and massive context window via @ai-sdk/google.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, generateObject, streamText } from 'ai';
import type { z } from 'zod';
import type { ModelProvider, ModelProviderOptions } from './interface.js';
import { suppressStreamResultRejections } from './interface.js';

export class GoogleProvider implements ModelProvider {
  public readonly id = 'google';
  public readonly name = 'Google';
  public readonly model: string;

  private client: ReturnType<typeof createGoogleGenerativeAI>;
  private options: ModelProviderOptions;

  constructor(options: ModelProviderOptions = {}) {
    this.options = options;
    this.model = options.model || 'gemini-2.0-flash';
    this.client = createGoogleGenerativeAI({
      apiKey: options.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
      baseURL: options.baseUrl,
    });
  }

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const result = await generateText({
      model: this.client(this.model),
      system: systemPrompt,
      prompt,
      temperature: this.options.temperature ?? 0.2,
      maxOutputTokens: this.options.maxTokens ?? 4096,
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
    });
    return result.object as T;
  }

  async streamText(prompt: string, systemPrompt?: string, onDelta?: (delta: string) => void): Promise<string> {
    const result = streamText({
      model: this.client(this.model),
      system: systemPrompt,
      prompt,
      temperature: this.options.temperature ?? 0.2,
      maxOutputTokens: this.options.maxTokens ?? 4096,
      maxRetries: 1,
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

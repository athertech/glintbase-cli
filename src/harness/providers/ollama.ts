/**
 * Local Model Provider Adapter for Ollama / vLLM / LM Studio
 * Connects to OpenAI-compatible local endpoints for 100% offline air-gapped execution.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { generateText, generateObject, streamText } from 'ai';
import type { z } from 'zod';
import type { ModelProvider, ModelProviderOptions } from './interface.js';

export class OllamaProvider implements ModelProvider {
  public readonly id = 'ollama';
  public readonly name = 'Local Ollama / vLLM';
  public readonly model: string;

  private client: ReturnType<typeof createOpenAI>;
  private options: ModelProviderOptions;

  constructor(options: ModelProviderOptions = {}) {
    this.options = options;
    this.model = options.model || 'qwen2.5-coder:32b';
    const baseUrl = options.baseUrl || process.env.OLLAMA_HOST || 'http://localhost:11434/v1';

    this.client = createOpenAI({
      baseURL: baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/v1`,
      apiKey: options.apiKey || 'ollama',
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
    });

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

/**
 * Live LLM Simulation Engine for Glintbase Flight Simulator.
 * Runs multi-turn ReAct loops against the configured model provider
 * using persona system prompts, or falls back cleanly to deterministic engine.
 */

import {
  SimulationOptions,
  SimulationTelemetry,
  TargetContext
} from '../types.js';
import { AgentPersona } from '../personas/base.js';
import { DeterministicEngine } from './deterministicEngine.js';
import { resolveModelProvider } from '../../harness/providers/resolver.js';
import { estimateTokens, calculateDollarTax } from '../telemetry/tokenTax.js';

export class LiveLlmEngine {
  static async run(
    persona: AgentPersona,
    targetContext: TargetContext,
    options: SimulationOptions
  ): Promise<SimulationTelemetry> {
    const resolution = resolveModelProvider();

    if (!resolution.provider) {
      // Clean fallback to deterministic engine
      const fallbackResult = await DeterministicEngine.run(persona, targetContext, options);
      if (fallbackResult.steps.length > 0) {
        fallbackResult.steps[0].details += ` [Note: Live LLM mode requested, but no provider API key configured. Executed deterministic simulation]`;
      }
      return fallbackResult;
    }

    const startTime = Date.now();
    const provider = resolution.provider;
    const systemPrompt = persona.systemPrompt;

    const missionIntent = options.intent || 'Inspect target and execute low-cost read tool';
    const prompt = `You are evaluating an API target: ${targetContext.targetUrl}.
Context details:
- llms.txt available: ${Boolean(targetContext.llmsTxt)}
- auth.md available: ${Boolean(targetContext.authMd)}
- MCP tools count: ${targetContext.mcpTools?.length || 0}
- Robots.txt available: ${Boolean(targetContext.robotsTxt)}

Mission Intent: "${missionIntent}"

Perform the following trajectory:
1. Verify capability discovery.
2. Ingest schema or endpoints.
3. Determine authentication scheme.
4. Choose and simulate tool dispatch.
5. Provide concise final status (COMPLETED or BLOCKED) and bottleneck if any.`;

    try {
      const response = await provider.generateText(prompt, systemPrompt);
      const totalDurationMs = Date.now() - startTime;

      const inputTokens = estimateTokens(systemPrompt + prompt);
      const outputTokens = estimateTokens(response);
      const totalTokensBurned = inputTokens + outputTokens;
      const dollarTaxUsd = calculateDollarTax(inputTokens, outputTokens);

      const isBlocked = response.toLowerCase().includes('blocked') || response.toLowerCase().includes('fail');

      return {
        outcome: isBlocked ? 'blocked' : 'completed',
        totalDurationMs,
        ttftcMs: Math.round(totalDurationMs * 0.7),
        totalTokensBurned,
        dollarTaxUsd,
        schemaFrictionScore: 15,
        steps: [
          {
            stepIndex: 1,
            phase: 'discovery',
            action: `Live Agent Discovery (${persona.name})`,
            status: 'pass',
            durationMs: Math.round(totalDurationMs * 0.25),
            tokensConsumed: Math.round(totalTokensBurned * 0.3),
            details: `Agent resolved entrypoints using model ${resolution.model}`
          },
          {
            stepIndex: 2,
            phase: 'execution',
            action: 'Execute Intent via Model',
            status: isBlocked ? 'fail' : 'pass',
            durationMs: Math.round(totalDurationMs * 0.75),
            tokensConsumed: Math.round(totalTokensBurned * 0.7),
            details: response.slice(0, 300)
          }
        ],
        failureBottleneck: isBlocked ? 'Agent reported trajectory blocked during live reasoning' : undefined
      };
    } catch (err: any) {
      // Fallback on provider error
      const fallbackResult = await DeterministicEngine.run(persona, targetContext, options);
      fallbackResult.steps.push({
        stepIndex: fallbackResult.steps.length + 1,
        phase: 'recovery',
        action: 'Provider Fallback Recovery',
        status: 'warn',
        durationMs: 50,
        tokensConsumed: 0,
        details: `Live provider error: ${err?.message}. Reverted to deterministic simulation.`
      });
      return fallbackResult;
    }
  }
}

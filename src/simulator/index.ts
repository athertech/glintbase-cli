/**
 * Glintbase Autonomous Agent Flight Simulator (Track 3)
 * Master Entry Point.
 */

import {
  SimulationOptions,
  SimulationTelemetry,
  CounterfactualComparison,
  TargetContext
} from './types.js';
import { getPersona, AgentPersona } from './personas/index.js';
import { DeterministicEngine } from './engines/deterministicEngine.js';
import { LiveLlmEngine } from './engines/liveLlmEngine.js';
import { CounterfactualHarness } from './counterfactual.js';

export * from './types.js';
export * from './personas/index.js';
export * from './telemetry/tokenTax.js';
export * from './telemetry/schemaFriction.js';
export * from './missions/safetyGuard.js';
export * from './missions/intentParser.js';
export * from './missions/goldenSuite.js';
export * from './counterfactual.js';
export * from './engines/deterministicEngine.js';
export * from './engines/liveLlmEngine.js';

export interface SimulationExecutionResult {
  telemetry: SimulationTelemetry;
  counterfactual?: CounterfactualComparison;
  persona: AgentPersona;
  targetContext: TargetContext;
}

/**
 * Main simulation runner dispatching agent personas across targets.
 */
export async function runSimulation(options: SimulationOptions): Promise<SimulationExecutionResult> {
  const persona = getPersona(options.agent || 'claude-code');
  const targetContext = await DeterministicEngine.probeTargetContext(options.target);

  let telemetry: SimulationTelemetry;
  if (options.mode === 'live') {
    telemetry = await LiveLlmEngine.run(persona, targetContext, options);
  } else {
    telemetry = await DeterministicEngine.run(persona, targetContext, options);
  }

  let counterfactual: CounterfactualComparison | undefined;
  if (telemetry.outcome !== 'completed' || telemetry.schemaFrictionScore > 30 || telemetry.suggestedRemediation) {
    counterfactual = await CounterfactualHarness.evaluate(persona, targetContext, options, telemetry);
  }

  return {
    telemetry,
    counterfactual,
    persona,
    targetContext
  };
}

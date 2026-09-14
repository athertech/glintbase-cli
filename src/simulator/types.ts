/**
 * Core Types & Interfaces for the Glintbase Flight Simulator.
 * Implements trajectory telemetry, persona constraints, and counterfactual testing.
 */

export type PersonaType = 'claude-code' | 'cursor' | 'perplexity';
export type SimulationMode = 'deterministic' | 'live';
export type StepStatus = 'pass' | 'warn' | 'fail' | 'skip';
export type TrajectoryOutcome = 'completed' | 'blocked' | 'hallucinated' | 'timed_out';
export type StepPhase = 'discovery' | 'ingestion' | 'auth' | 'execution' | 'recovery';

export interface SimulationOptions {
  target: string;
  agent?: PersonaType;
  mode?: SimulationMode;
  intent?: string;
  allowMutations?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
  json?: boolean;
  ci?: boolean;
}

export interface TrajectoryStep {
  stepIndex: number;
  phase: StepPhase;
  action: string;
  status: StepStatus;
  durationMs: number;
  tokensConsumed: number;
  details: string;
  evidence?: Record<string, any>;
  error?: {
    code: string;
    message: string;
    schemaPath?: string;
    expectedType?: string;
    receivedType?: string;
  };
}

export interface SimulationTelemetry {
  outcome: TrajectoryOutcome;
  totalDurationMs: number;
  ttftcMs?: number; // Time-To-First-Tool-Call
  totalTokensBurned: number;
  dollarTaxUsd: number; // Cost at standard Tier-1 model rates ($3/M in, $15/M out)
  schemaFrictionScore: number; // 0 (flawless) to 100 (hostile)
  steps: TrajectoryStep[];
  failureBottleneck?: string;
  suggestedRemediation?: {
    command: string;
    file: string;
    fixSnippet: string[];
    rationale: string;
  };
}

export interface CounterfactualComparison {
  before: SimulationTelemetry;
  after: SimulationTelemetry;
  tokensSavedPercent: number;
  latencySavedPercent: number;
  fixedBottlenecks: string[];
  resolved: boolean;
}

export interface MissionDefinition {
  id: string;
  name: string;
  goal: string;
  targetPhases: StepPhase[];
  intentPrompt?: string;
}

export interface TargetContext {
  targetUrl: string;
  isUrl: boolean;
  codebaseDir?: string;
  robotsTxt?: string;
  llmsTxt?: string;
  authMd?: string;
  ardJson?: any;
  mcpManifest?: any;
  mcpEndpoint?: string;
  mcpTools?: Array<{
    name: string;
    description: string;
    inputSchema?: any;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
  }>;
  openApiSpec?: any;
}

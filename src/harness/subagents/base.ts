/**
 * BaseSubagent abstract class.
 * Implements the 3x self-correction verification loop with ArsSandbox.
 */

import type { ModelProvider } from '../providers/interface.js';
import type { Skill } from '../skills/loader.js';
import type {
  ProposedArtifact,
  SubagentResult,
  SubagentContext,
} from '../types.js';
import { ArsSandbox } from '../../core/sandbox.js';

export abstract class BaseSubagent {
  public abstract readonly id: string;
  public abstract readonly layer: 'discovery' | 'access' | 'usability' | 'payments';
  public abstract readonly name: string;

  protected provider: ModelProvider | null;
  protected skill: Skill | null;
  protected maxIterations: number;

  constructor(provider?: ModelProvider | null, skill?: Skill | null, maxIterations = 3) {
    this.provider = provider || null;
    this.skill = skill || null;
    this.maxIterations = maxIterations;
  }

  /**
   * Abstract generator to be implemented by specialized subagents.
   */
  public abstract generateArtifacts(
    context: SubagentContext,
    diagnosticFeedback?: string
  ): Promise<ProposedArtifact[]>;

  /**
   * Run the subagent with the automated 3x in-memory ARS self-correction loop.
   */
  public async execute(context: SubagentContext): Promise<SubagentResult> {
    const sandbox = new ArsSandbox(context.existingFiles);
    let iterations = 0;
    let artifacts: ProposedArtifact[] = [];
    let feedback: string | undefined;
    let errors: string[] = [];
    let passed = false;

    while (iterations < this.maxIterations) {
      iterations++;
      artifacts = await this.generateArtifacts(context, feedback);

      // Verify draft artifacts in sandbox
      const verification = sandbox.verifyAll(artifacts);

      if (verification.passed) {
        passed = true;
        errors = [];
        break;
      }

      // Self-correction loop: prepare feedback for next iteration
      errors = verification.errors;
      feedback = `ARS 2.0 Probe Failures on Iteration ${iterations}: ${errors.join('; ')}. Fix these issues.`;
    }

    const passRate = passed ? 1.0 : Math.max(0, (this.maxIterations - errors.length) / this.maxIterations);

    return {
      subagentId: this.id,
      layer: this.layer,
      artifacts,
      probePassRate: passRate,
      iterations,
      passed,
      errors,
    };
  }
}

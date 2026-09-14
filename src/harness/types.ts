/**
 * Core Types for Glintbase Agent Harness & Subagent Swarm.
 */

export interface ProposedArtifact {
  targetPath: string;
  action: 'create' | 'update' | 'delete';
  content: string;
  originalContent?: string;
  rationale: string;
  pointsImpact: number;
  layer: 'discovery' | 'access' | 'usability' | 'payments';
}

export interface SandboxVerificationResult {
  passed: boolean;
  score: number;
  diagnostics: string[];
  errors: string[];
}

export interface SubagentResult {
  subagentId: string;
  layer: 'discovery' | 'access' | 'usability' | 'payments';
  artifacts: ProposedArtifact[];
  probePassRate: number; // 0.0 to 1.0
  iterations: number;
  passed: boolean;
  errors: string[];
}

export interface SubagentContext {
  cwd: string;
  projectName: string;
  projectDescription: string;
  domainUrl?: string;
  existingFiles: Record<string, string>;
  detectedFramework?: string;
  framework?: string;
  routes?: any[];
  docIndex?: any;
}

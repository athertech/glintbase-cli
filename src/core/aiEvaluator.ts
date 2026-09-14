/**
 * Agentic AI Evaluator for Glintbase Audit 3.0.
 * Performs deep semantic evaluations of agent-facing artifacts (llms.txt, auth.md, OpenAPI specs, agent rules)
 * using configured ModelProviders with structured Zod schemas at temperature 0 for complete determinism.
 * Falls back cleanly to deterministic AST/regex heuristics when offline.
 */

import { z } from 'zod';
import type { ModelProvider } from '../harness/providers/interface.js';

export interface SemanticEvaluationResult {
  passed: boolean;
  score: number; // 0 - 100
  evaluatedWithAi: boolean;
  modelUsed?: string;
  summary: string;
  issues: string[];
  recommendations: string[];
}

export const EvaluationSchema = z.object({
  passed: z.boolean().describe('Whether the artifact meets production agent-readiness standards'),
  score: z.number().min(0).max(100).describe('Quality score from 0 to 100'),
  summary: z.string().describe('Concise 1-sentence evaluation summary'),
  issues: z.array(z.string()).describe('Specific gaps, ambiguities, or issues found'),
  recommendations: z.array(z.string()).describe('Actionable instructions to make this artifact optimal for autonomous AI agents'),
});

/**
 * Offline deterministic heuristic evaluator for when no LLM provider is active or reachable.
 */
export function evaluateOfflineHeuristic(
  artifactType: 'llms.txt' | 'auth.md' | 'openapi' | 'rules',
  content: string
): SemanticEvaluationResult {
  const trimmed = (content || '').trim();
  if (!trimmed) {
    return {
      passed: false,
      score: 0,
      evaluatedWithAi: false,
      summary: `Artifact ${artifactType} is empty or missing.`,
      issues: ['File has no content'],
      recommendations: [`Create a valid ${artifactType} file.`],
    };
  }

  const issues: string[] = [];
  const recommendations: string[] = [];
  let score = 50;

  if (artifactType === 'llms.txt') {
    if (!trimmed.startsWith('# ')) {
      issues.push('Missing top-level H1 title (# Project Name)');
      recommendations.push('Add an H1 heading at line 1 naming the project or API.');
    } else {
      score += 15;
    }

    const hasLinks = /\[.*?\]\(.*?\)/.test(trimmed);
    if (!hasLinks) {
      issues.push('No markdown links to documentation, endpoints, or guides found');
      recommendations.push('Add structured bullet points with links: - [Title](url): description');
    } else {
      score += 20;
    }

    const lineCount = trimmed.split('\n').filter(l => l.trim().length > 0).length;
    if (lineCount < 5) {
      issues.push('Content is too brief (< 5 lines) to provide sufficient agent orientation');
      recommendations.push('Expand llms.txt with core capabilities and key reference URLs.');
    } else {
      score += 15;
    }

    score = Math.min(100, Math.max(0, score));
    return {
      passed: score >= 70,
      score,
      evaluatedWithAi: false,
      summary: score >= 70
        ? 'llms.txt adheres to structural format requirements.'
        : 'llms.txt has structural formatting gaps.',
      issues,
      recommendations,
    };
  }

  if (artifactType === 'auth.md') {
    const hasHeaders = /header|bearer|authorization/i.test(trimmed);
    const hasScopes = /scope|permission|role/i.test(trimmed);
    const hasOauth = /oauth|token|client_credentials/i.test(trimmed);

    if (hasHeaders) score += 20; else issues.push('No Authorization header format specified');
    if (hasScopes) score += 15; else issues.push('No API scopes or permissions documented');
    if (hasOauth) score += 15; else issues.push('No token acquisition flow documented');

    score = Math.min(100, Math.max(0, score));
    return {
      passed: score >= 70,
      score,
      evaluatedWithAi: false,
      summary: score >= 70
        ? 'auth.md provides core authentication details.'
        : 'auth.md is missing key authentication guidance for autonomous agents.',
      issues,
      recommendations,
    };
  }

  if (artifactType === 'openapi') {
    let parsed: any = null;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Might be YAML
    }

    if (parsed) {
      const pathCount = Object.keys(parsed.paths || {}).length;
      if (pathCount > 0) score += 30; else issues.push('OpenAPI spec contains 0 paths');
      if (parsed.info?.title) score += 10; else issues.push('Missing API title in info block');
      if (parsed.components?.securitySchemes) score += 10; else issues.push('Missing components.securitySchemes declaration');
    } else if (trimmed.includes('openapi:') || trimmed.includes('paths:')) {
      score += 40;
    } else {
      issues.push('Unable to parse valid OpenAPI JSON or YAML structure');
    }

    score = Math.min(100, Math.max(0, score));
    return {
      passed: score >= 70,
      score,
      evaluatedWithAi: false,
      summary: score >= 70
        ? 'OpenAPI specification structure verified.'
        : 'OpenAPI specification requires structural fixes.',
      issues,
      recommendations,
    };
  }

  // Rules (.cursorrules, .claude, etc.)
  if (trimmed.length > 50) score += 30;
  if (/rule|convention|never|always|format/i.test(trimmed)) score += 20;

  return {
    passed: score >= 70,
    score: Math.min(100, score),
    evaluatedWithAi: false,
    summary: 'Agent rule file verified with offline heuristics.',
    issues,
    recommendations,
  };
}

/**
 * Perform semantic evaluation using active ModelProvider with strict schema and temperature 0.
 * Falls back to offline heuristics if model call times out, fails, or is unavailable.
 */
export async function evaluateArtifactSemantics(
  artifactType: 'llms.txt' | 'auth.md' | 'openapi' | 'rules',
  content: string,
  provider: ModelProvider | null
): Promise<SemanticEvaluationResult> {
  if (!provider || !content || !content.trim()) {
    return evaluateOfflineHeuristic(artifactType, content);
  }

  const systemPrompt = `You are the Glintbase ARS 3.0 Agent Readiness Evaluator.
Your role is to rigorously evaluate developer documentation, API schemas, and protocol files
for autonomous AI agents (Claude Code, Cursor, Windsurf, Devin, autonomous LLM swarms).
Score objectively from 0 to 100 based on whether an autonomous agent can understand and act upon this artifact without hallucination.
Be concise, deterministic, and factual.`;

  const prompts: Record<string, string> = {
    'llms.txt': `Evaluate this /llms.txt file content for AI agent readiness:
\`\`\`markdown
${content.slice(0, 8000)}
\`\`\`
Criteria:
1. Does it start with an H1 (# Project) and high-signal summary?
2. Are key documentation endpoints and guide URLs provided in clean markdown lists?
3. Does it provide concise context without bloated marketing copy?
4. Is it immediately consumable by an LLM in its system prompt?`,

    'auth.md': `Evaluate this /auth.md authentication documentation for autonomous AI agent execution:
\`\`\`markdown
${content.slice(0, 8000)}
\`\`\`
Criteria:
1. Does it specify exact Authorization header formats (e.g. Bearer tokens, API keys)?
2. Does it detail token acquisition / OAuth endpoints or CLI setup?
3. Are scopes, rate limits, and error status codes (401, 403) explicitly documented?`,

    'openapi': `Evaluate this OpenAPI specification snippet for LLM tool calling:
\`\`\`
${content.slice(0, 8000)}
\`\`\`
Criteria:
1. Are operation IDs and path summaries descriptive and distinct?
2. Are parameter types, request bodies, and response schemas specified?
3. Can an autonomous AI agent generate correct function call parameters without ambiguity?`,

    'rules': `Evaluate this agent rules / system prompt configuration:
\`\`\`
${content.slice(0, 8000)}
\`\`\`
Criteria:
1. Are coding guidelines and constraints actionable?
2. Are there any conflicting or ambiguous directives?
3. Does it establish clear tool usage and output conventions?`,
  };

  try {
    const prompt = prompts[artifactType] || `Evaluate this artifact:\n${content.slice(0, 8000)}`;

    let result: z.infer<typeof EvaluationSchema>;

    try {
      // Primary: try structured schema generation with 15-second timeout
      const aiPromise = provider.generateObject(prompt, EvaluationSchema, systemPrompt);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI evaluation timed out after 15000ms')), 15000)
      );
      result = await Promise.race([aiPromise, timeoutPromise]);
    } catch (objErr: any) {
      // Secondary: for reasoning models (Qwen, DeepSeek) where JSON schema mode can conflict with <think> tags,
      // fall back to generateText and parse the JSON block directly.
      const fallbackPrompt = `${systemPrompt}\n\n${prompt}\n\nRespond ONLY with a JSON object matching this schema:\n{\n  "passed": boolean,\n  "score": number,\n  "summary": string,\n  "issues": string[],\n  "recommendations": string[]\n}\nOutput valid JSON only.`;
      const rawText = await provider.generateText(fallbackPrompt);
      const cleaned = rawText
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const jsonSlice = cleaned.slice(firstBrace, lastBrace + 1);
        result = EvaluationSchema.parse(JSON.parse(jsonSlice));
      } else {
        throw objErr;
      }
    }

    return {
      passed: result.passed,
      score: Math.min(100, Math.max(0, Math.round(result.score))),
      evaluatedWithAi: true,
      modelUsed: `${provider.model} (${provider.id})`,
      summary: result.summary,
      issues: result.issues || [],
      recommendations: result.recommendations || [],
    };
  } catch (err: any) {
    // Graceful fallback to offline heuristic on API error or timeout
    const fallback = evaluateOfflineHeuristic(artifactType, content);
    fallback.summary += ` (AI evaluation fallback: ${err?.message || 'offline'})`;
    return fallback;
  }
}

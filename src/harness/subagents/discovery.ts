/**
 * Discovery Subagent for Layer 1.
 * Generates and maintains robots.txt, llms.txt, and .well-known/ard.json.
 */

import { BaseSubagent } from './base.js';
import type { ProposedArtifact, SubagentContext } from '../types.js';
import { generateRobotsTxt, generateArdJson, generateAiCatalogJson } from '../../ast/generators.js';
import { generateLlmsTxt } from '../../ast/docIndexer.js';

export class DiscoverySubagent extends BaseSubagent {
  public readonly id = 'discovery-subagent';
  public readonly layer = 'discovery' as const;
  public readonly name = 'Discovery Subagent';

  public async generateArtifacts(
    context: SubagentContext,
    diagnosticFeedback?: string
  ): Promise<ProposedArtifact[]> {
    const artifacts: ProposedArtifact[] = [];
    const name = context.projectName || 'API Platform';
    const desc = context.projectDescription || 'Developer documentation and API services';

    // 1. Generate robots.txt
    const robotsContent = generateRobotsTxt();

    artifacts.push({
      targetPath: 'public/robots.txt',
      action: 'create',
      content: robotsContent,
      rationale: 'Permit AI bots (ClaudeBot, GPTBot) and declare Content Signals policy',
      pointsImpact: 10,
      layer: 'discovery',
    });

    // 2. Generate llms.txt using real docIndex if available
    let llmsContent: string;
    if (context.docIndex && context.docIndex.docs && context.docIndex.docs.length > 0) {
      llmsContent = generateLlmsTxt(context.docIndex);
    } else {
      llmsContent = `# ${name}

> ${desc}

## Overview
- [Documentation](/docs): Complete API reference and guides
- [Authentication](/auth.md): Machine authentication protocol handbook
- [OpenAPI Specification](/openapi.json): Full machine-readable API catalog
- [Model Context Protocol](/api/mcp): Live streamable MCP tool server

## Key APIs & Resources
- [Authentication Handbook](/auth.md): Machine bearer tokens and API keys
- [Core Endpoints](/docs/api): REST operations and webhook specifications
- [Error Codes](/docs/errors): Typed HTTP problem responses
`;
    }

    artifacts.push({
      targetPath: 'public/llms.txt',
      action: 'create',
      content: llmsContent,
      rationale: 'Curated token-budgeted documentation index for coding agents',
      pointsImpact: 10,
      layer: 'discovery',
    });

    // 3. Generate .well-known/ard.json
    const ardContent = generateArdJson({ name });

    artifacts.push({
      targetPath: 'public/.well-known/ard.json',
      action: 'create',
      content: ardContent,
      rationale: 'Standard Agent Resource Discovery manifest (ARD v0.91)',
      pointsImpact: 5,
      layer: 'discovery',
    });

    // 4. Generate .well-known/ai-catalog.json (Agent-Card WG) when requested
    if ((context as any).includeAiCatalog) {
      const aiCatalogContent = generateAiCatalogJson({ name, baseUrl: context.domainUrl });
      artifacts.push({
        targetPath: 'public/.well-known/ai-catalog.json',
        action: 'create',
        content: aiCatalogContent,
        rationale: 'Agent-Card Working Group AI Catalog specification',
        pointsImpact: 2,
        layer: 'discovery',
      });
    }

    return artifacts;
  }
}

/**
 * Access Subagent for Layer 2.
 * Generates OpenAPI 3.1 specifications, Anti-SPA 404 handlers,
 * and Content Negotiation middleware.
 */

import { BaseSubagent } from './base.js';
import type { ProposedArtifact, SubagentContext } from '../types.js';
import {
  generateOpenApiSpec,
  generateNotFoundRoute,
  generateMiddleware,
} from '../../ast/generators.js';

export class AccessSubagent extends BaseSubagent {
  public readonly id = 'access-subagent';
  public readonly layer = 'access' as const;
  public readonly name = 'Access & Understanding Subagent';

  public async generateArtifacts(
    context: SubagentContext,
    diagnosticFeedback?: string
  ): Promise<ProposedArtifact[]> {
    const artifacts: ProposedArtifact[] = [];
    const name = context.projectName || 'API Platform';
    const domainUrl = context.domainUrl || 'http://localhost:3000';

    // 1. Generate OpenAPI 3.1 specification
    const openApiContent = generateOpenApiSpec({
      title: name,
      routes: context.routes,
      baseUrl: domainUrl,
    });

    artifacts.push({
      targetPath: 'public/openapi.json',
      action: 'create',
      content: openApiContent,
      rationale: 'Machine-readable OpenAPI 3.1 specification for tool-use and schema reasoning',
      pointsImpact: 15,
      layer: 'access',
    });

    // 2. Anti-SPA 404 Route Handler
    if (context.framework === 'next-app-router') {
      artifacts.push({
        targetPath: 'app/not-found.tsx',
        action: 'create',
        content: generateNotFoundRoute('next-app-router'),
        rationale: 'Eliminate soft-200 SPA leaks to autonomous agents (Anti-SPA Canary standard)',
        pointsImpact: 5,
        layer: 'access',
      });
    } else if (context.framework === 'next-pages-router') {
      artifacts.push({
        targetPath: 'pages/404.tsx',
        action: 'create',
        content: generateNotFoundRoute('next-pages-router'),
        rationale: 'Eliminate soft-200 SPA leaks to autonomous agents (Anti-SPA Canary standard)',
        pointsImpact: 5,
        layer: 'access',
      });
    }

    // 3. Content Negotiation Middleware (Vary: Accept)
    if (context.framework === 'next-app-router' || context.framework === 'next-pages-router') {
      artifacts.push({
        targetPath: 'middleware.ts',
        action: 'create',
        content: generateMiddleware(),
        rationale: 'Enforce Content Negotiation (Accept: text/markdown) and emit Vary: Accept header',
        pointsImpact: 5,
        layer: 'access',
      });
    }

    return artifacts;
  }
}

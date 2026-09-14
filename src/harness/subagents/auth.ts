/**
 * Auth Subagent for Layer 3.
 * Generates WorkOS auth.md and RFC 9728 OAuth Protected Resource discovery metadata.
 */

import { BaseSubagent } from './base.js';
import type { ProposedArtifact, SubagentContext } from '../types.js';
import { generateAuthMd } from '../../ast/generators.js';

export class AuthSubagent extends BaseSubagent {
  public readonly id = 'auth-subagent';
  public readonly layer = 'usability' as const;
  public readonly name = 'Auth Subagent';

  public async generateArtifacts(
    context: SubagentContext,
    diagnosticFeedback?: string
  ): Promise<ProposedArtifact[]> {
    const artifacts: ProposedArtifact[] = [];
    const name = context.projectName || 'API Platform';
    const domainUrl = context.domainUrl || 'http://localhost:3000';

    // 1. Generate WorkOS auth.md using canonical 8-stage specification
    const authContent = generateAuthMd({
      projectName: name,
      routes: context.routes,
      baseUrl: domainUrl,
    });

    artifacts.push({
      targetPath: 'public/auth.md',
      action: 'create',
      content: authContent,
      rationale: 'Machine-readable authentication specification following WorkOS standard',
      pointsImpact: 15,
      layer: 'usability',
    });

    // 2. Generate RFC 9728 OAuth Protected Resource discovery metadata
    const oauthMetadata = JSON.stringify(
      {
        resource: domainUrl,
        authorization_servers: [`${domainUrl.replace(/\/$/, '')}/api/auth`],
        scopes_supported: ['read', 'write'],
        bearer_methods_supported: ['header'],
        documentation: `${domainUrl.replace(/\/$/, '')}/auth.md`,
      },
      null,
      2
    );

    artifacts.push({
      targetPath: 'public/.well-known/oauth-protected-resource',
      action: 'create',
      content: oauthMetadata,
      rationale: 'RFC 9728 OAuth Protected Resource discovery specification',
      pointsImpact: 5,
      layer: 'usability',
    });

    return artifacts;
  }
}

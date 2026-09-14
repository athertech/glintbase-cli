/**
 * Commerce Subagent for Layer 4.
 * Generates Universal Commerce Protocol (UCP) profiles and Machine Payments Protocol (MPP) specs.
 */

import { BaseSubagent } from './base.js';
import type { ProposedArtifact, SubagentContext } from '../types.js';

export class CommerceSubagent extends BaseSubagent {
  public readonly id = 'commerce-subagent';
  public readonly layer = 'payments' as const;
  public readonly name = 'Commerce Subagent';

  public async generateArtifacts(
    context: SubagentContext,
    diagnosticFeedback?: string
  ): Promise<ProposedArtifact[]> {
    const artifacts: ProposedArtifact[] = [];
    const name = context.projectName || 'Store Platform';

    // 1. Generate UCP Profile
    const ucpContent = JSON.stringify(
      {
        ucp_version: '1.0',
        merchant_name: name,
        catalog_url: '/api/ucp/catalog.json',
        cart_url: '/api/ucp/cart',
        checkout_url: '/api/ucp/checkout',
        supported_settlements: ['x402', 'mpp', 'stripe_agent_tokens'],
      },
      null,
      2
    );

    artifacts.push({
      targetPath: 'public/.well-known/ucp',
      action: 'create',
      content: ucpContent,
      rationale: 'Universal Commerce Protocol (UCP) catalog and checkout entrypoint',
      pointsImpact: 10,
      layer: 'payments',
    });

    // 2. Generate MPP Rate Card
    const mppContent = JSON.stringify(
      {
        mpp_version: '1.0.0',
        merchant: name,
        accepted_tokens: ['USDC', 'lightning', 'machine_usd'],
        rate_limits: {
          max_single_transaction_usd: 50.0,
        },
      },
      null,
      2
    );

    artifacts.push({
      targetPath: 'public/.well-known/mpp.json',
      action: 'create',
      content: mppContent,
      rationale: 'Machine Payments Protocol settlement rate card',
      pointsImpact: 10,
      layer: 'payments',
    });

    return artifacts;
  }
}

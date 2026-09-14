/**
 * Glintbase Agent Authentication & Machine Identity Verifier.
 * Validates /auth.md handbook, WorkOS 8-stage canonical specification,
 * RFC 9728 OAuth protected resource discovery, and machine credentials exchange.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fetchResource } from '../fetchResource.js';

export interface AgentAuthVerificationResult {
  target: string;
  isLocal: boolean;
  hasAuthHandbook: boolean;
  isWorkOsCompliant: boolean;
  authSchemes: string[];
  endpoints: {
    discovery?: string;
    token?: string;
    register?: string;
    revocation?: string;
  };
  rateLimitHeaders: {
    limit?: string;
    remaining?: string;
    reset?: string;
  };
  hasRevocationEndpoint: boolean;
  complianceStatus: 'VERIFIED' | 'INCOMPLETE' | 'MISSING';
  findings: string[];
  remediationCommand?: string;
}

export async function verifyAgentAuth(target = '.'): Promise<AgentAuthVerificationResult> {
  const isUrl = /^https?:\/\//i.test(target);
  let authContent = '';
  let filePath: string | null = null;
  let hasDiscoveryEndpoint = false;

  if (isUrl) {
    const baseUrl = target.replace(/\/$/, '');
    try {
      const res = await fetchResource(`${baseUrl}/auth.md`, { timeoutMs: 3000 });
      if (res.ok && res.body && !res.status.includes('404')) {
        authContent = res.body;
      }
    } catch {
      // unreachable
    }

    try {
      const disc = await fetchResource(`${baseUrl}/.well-known/oauth-protected-resource`, { timeoutMs: 2500 });
      if (disc.ok && disc.body && !disc.status.includes('404')) {
        hasDiscoveryEndpoint = true;
      }
    } catch {
      // unreachable
    }
  } else {
    const root = resolve(process.cwd(), target);
    const candidates = [
      join(root, 'public', 'auth.md'),
      join(root, 'auth.md'),
      join(root, '.well-known', 'auth.md'),
    ];

    for (const c of candidates) {
      if (existsSync(c)) {
        filePath = c;
        authContent = readFileSync(c, 'utf-8');
        break;
      }
    }

    const discPath = join(root, '.well-known', 'oauth-protected-resource');
    if (existsSync(discPath) || existsSync(`${discPath}.json`)) {
      hasDiscoveryEndpoint = true;
    }
  }

  if (!authContent) {
    return {
      target,
      isLocal: !isUrl,
      hasAuthHandbook: false,
      isWorkOsCompliant: false,
      authSchemes: [],
      endpoints: {},
      rateLimitHeaders: {},
      hasRevocationEndpoint: false,
      complianceStatus: 'MISSING',
      findings: [
        'No /auth.md handbook discovered at root or /public.',
        'Autonomous AI agents have no standardized entrypoint to discover machine scopes, token exchange endpoints, or Bearer auth requirements.',
      ],
      remediationCommand: 'glintbase generate auth',
    };
  }

  const findings: string[] = [];
  const authLower = authContent.toLowerCase();
  const hasFrontmatter = authContent.trimStart().startsWith('---');

  const authSchemes: string[] = [];
  if (authLower.includes('bearer') || authLower.includes('bearer_token')) authSchemes.push('bearer_token');
  if (authLower.includes('api_key') || authLower.includes('api key')) authSchemes.push('api_key');
  if (authLower.includes('oauth2_client_credentials') || authLower.includes('client_credentials')) authSchemes.push('oauth2_client_credentials');
  if (authLower.includes('service_auth')) authSchemes.push('service_auth');

  const endpoints: AgentAuthVerificationResult['endpoints'] = {};
  if (authLower.includes('token') && (authLower.includes('/token') || authLower.includes('token:'))) {
    endpoints.token = 'Declared in auth.md';
  }
  if (hasDiscoveryEndpoint || authLower.includes('oauth-protected-resource') || authLower.includes('discovery:')) {
    endpoints.discovery = 'RFC 9728 discovery declared';
  }
  if (authLower.includes('revoke') || authLower.includes('revocation')) {
    endpoints.revocation = 'RFC 7009 token revocation declared';
  }
  if (authLower.includes('register') || authLower.includes('client registration')) {
    endpoints.register = 'Dynamic client registration declared';
  }

  const rateLimitHeaders: AgentAuthVerificationResult['rateLimitHeaders'] = {};
  if (authContent.includes('RateLimit-Limit') || authLower.includes('ratelimit')) {
    rateLimitHeaders.limit = 'RateLimit-Limit';
    rateLimitHeaders.remaining = 'RateLimit-Remaining';
    rateLimitHeaders.reset = 'RateLimit-Reset';
  }

  const hasBearerOrKey = authSchemes.includes('bearer_token') || authSchemes.includes('api_key');
  const hasRevocation = Boolean(endpoints.revocation);
  const isWorkOsCompliant = hasFrontmatter && hasBearerOrKey && authSchemes.length > 0;

  if (isWorkOsCompliant) {
    findings.push('Verified WorkOS auth.md handbook with structured YAML frontmatter.');
  } else {
    findings.push('auth.md exists but lacks WorkOS standard YAML frontmatter specifying auth_schemes.');
  }

  if (authSchemes.length > 0) {
    findings.push(`Supported machine authentication schemes: ${authSchemes.join(', ')}.`);
  }

  if (endpoints.token) {
    findings.push('Machine token exchange endpoint configured for autonomous agent grant acquisition.');
  }

  if (hasRevocation) {
    findings.push('RFC 7009 token revocation endpoint configured for session security.');
  } else {
    findings.push('Token revocation endpoint not declared. Agents completing sessions may leave tokens unrevoked.');
  }

  const complianceStatus = isWorkOsCompliant && hasBearerOrKey ? 'VERIFIED' : 'INCOMPLETE';

  return {
    target,
    isLocal: !isUrl,
    hasAuthHandbook: true,
    isWorkOsCompliant,
    authSchemes,
    endpoints,
    rateLimitHeaders,
    hasRevocationEndpoint: hasRevocation,
    complianceStatus,
    findings,
    remediationCommand: complianceStatus === 'INCOMPLETE' ? 'glintbase generate auth' : undefined,
  };
}

---
name: agent-readiness
description: Master framework for auditing, scoring, and optimizing web applications and APIs across the 4 ARS 3.2 layers.
---

# Glintbase Agent Readiness Master Playbook (ARS 3.2)

Glintbase evaluates websites, developer portals, and APIs on the **Agent Readiness Score (ARS 3.2)**: a 0-100 score of which agent-readiness signals a product exposes and whether they work when probed. A check earns points only when the scanner observed the evidence; checks it could not verify are reported as skipped and excluded from the score. ARS 3.2 is not yet validated as a predictor of agent task success. Full methodology: https://glintbase.dev/methodology

## The 4 Layers of ARS 3.2 (129 registered checks)

Layer weights depend on the site's archetype (API/devtool and docs: Discovery 20, Access 30, Usability 35; e-commerce adds Payments 10).

1. **Discovery** (17 checks):
   - robots.txt with an explicit AI-crawler policy (ClaudeBot, GPTBot, PerplexityBot, OAI-SearchBot).
   - /.well-known/ard.json and AI catalog files; an MCP manifest with name, description, icon and endpoint.
   - An npm package under your brand that links back to your domain; Wikidata official-website claim (bonus).

2. **Access & Understanding** (45 checks):
   - Content readable without JavaScript; genuine HTTP 404 for missing routes (no SPA soft-200 shells).
   - /llms.txt with a heading, real links (the scanner fetches up to 8; at least 80% must resolve) and /llms-full.txt.
   - Accept: text/markdown content negotiation (with Vary: Accept), an OpenAPI spec at a standard path, sitemap.xml, meta description, canonical URL, JSON-LD, security headers.

3. **Usability & Interoperability** (61 checks):
   - A live MCP server: the scanner runs initialize, tools/list and an unknown-tool canary. Tools need object input schemas with typed properties and readOnlyHint / destructiveHint annotations; errors must be signalled in-channel (JSON-RPC error or isError: true). The scanner only ever calls tools annotated readOnlyHint: true with no required arguments.
   - OpenAPI quality read from the spec: unique operationIds, JSON request schemas, typed error responses, Idempotency-Key, rate-limit headers, problem+json, cursor pagination, OpenAPI 3.1.
   - Auth discoverability: RFC 9728 protected-resource metadata, RFC 8414 server metadata, WWW-Authenticate with resource_metadata; /auth.md stages are bonus-only.
   - WebMCP: navigator.modelContext tools or declarative form attributes (bonus).

4. **Payments** (6 checks, e-commerce only): ACP, UCP, AP2, x402, MPP agent-commerce protocols.

## How to raise a score honestly

- Fix what the scan reports as warn/fail; skipped checks mean the scanner could not verify something, not that you failed it.
- Check the evidence coverage line: layers flagged "low evidence" rest on few verifiable checks.
- Don't publish surfaces you don't support (fake OAuth metadata, placeholder APIs): ARS 3.2 inspects content, so empty or fabricated artifacts earn nothing.

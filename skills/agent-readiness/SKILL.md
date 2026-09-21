---
name: agent-readiness
description: Master framework for auditing, scoring, and optimizing web applications and APIs across the 6 ARS 3.0 pillars.
---

# Glintbase Agent Readiness Master Playbook (ARS 3.0)

Glintbase evaluates websites, developer portals, and APIs on the **Agent Readiness Score (ARS 3.0)** — an empirical 0–100 scale measuring how effectively autonomous AI coding agents (Claude Code, Cursor, Windsurf, Devin, Antigravity) can navigate, authenticate, and call endpoints without human intervention.

## The 6 Pillars of ARS 3.0

1. **Discovery (20 pts)**:
   - `robots.txt`: Explicitly permit AI crawlers (`ClaudeBot`, `GPTBot`, `PerplexityBot`, `Antigravity`).
   - `/llms.txt` & `/.well-known/ard.json`: Expose entrypoints with concise H1/H2 link hierarchies and token budgets $le 25text{k}$ tokens.
   - Agent Configuration: Include project context rules in `.claude/`, `.cursor/`, or `.agents/`.

2. **Access (25 pts)**:
   - Anti-SPA 404 Leaks: Nonexistent routes must return genuine HTTP 404 status codes. Never return HTTP 200 SPA HTML shells for missing APIs or docs.
   - Content Negotiation: Support `Accept: text/markdown` for clean LLM extraction.
   - No-JS SSR Resilience: Ensure pages serve $>500$ characters of clean semantic text without JavaScript execution.

3. **Usability (25 pts)**:
   - Machine Authentication: Provide `/auth.md` with WorkOS-compliant frontmatter and clear OAuth2 / API key instructions.
   - Streamable HTTP MCP Route: Expose `/api/mcp` adhering to Anthropic MCP 2024-11-05 specifications.
   - Strict Schemas: OpenAPI 3.1 or JSON-RPC 2.0 with strict types, non-empty `required[]`, and descriptive parameter summaries.

4. **Semantic (10 pts)**:
   - High-density documentation without visual layout noise, banner bloat, or redundant markup.
   - Structured JSON-LD / schema.org metadata and clear conceptual hierarchy.

5. **Architecture (10 pts)**:
   - Proper REST / JSON-RPC conventions, cursor-based pagination, idempotency headers (`Idempotency-Key`), and standard rate-limit headers (`RateLimit-*`).

6. **Safety (10 pts)**:
   - Tool mutation safety: Declare `readOnlyHint: true` on safe queries and `destructiveHint: true` on state-changing operations.
   - CORS & Auth: Strict CORS preflight handling on agent entrypoints.

## Quick Remediation Workflow

1. Run `glintbase audit .` or use MCP tool `glintbase_audit` to obtain your baseline score.
2. Generate missing living artifacts via `glintbase_generate_artifact`:
   - `spec: "robots"` -> `public/robots.txt`
   - `spec: "llms"` -> `public/llms.txt`
   - `spec: "auth"` -> `public/auth.md`
   - `spec: "mcp"` -> `app/api/mcp/route.ts`
3. Verify using `glintbase_simulate_flight` to watch synthetic personas (Claude Code, Cursor) complete developer journeys.
4. Enforce in CI with `glintbase ci . --fail-under 75`.

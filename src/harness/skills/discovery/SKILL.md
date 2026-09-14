---
name: discovery-skill
description: Authoritative standard for auditing, constructing, and maintaining Layer 1 Discovery surfaces including public/llms.txt, llms-full.txt, crawler-friendly robots.txt, and .well-known/ard.json (Agent Resource Discovery) manifests.
layer: discovery
version: 2.0.0
metadata:
  standard: llms.txt standard (2024), ARD v0.91, Content Signals
  points_impact: 25
  target_runtimes: [Next.js, Astro, Vite, Static, All Web Platforms]
  research_sources:
    - title: "The /llms.txt Specification"
      url: "https://llmstxt.org"
    - title: "Content Signals Protocol Specification"
      url: "https://contentsignals.org"
    - title: "Glintbase Surface Discovery Specification (SPEC-02)"
      path: "glintscanner/docs/specs/02-discovery.md"
    - title: "Glintbase Crawl & Extraction Specification (SPEC-03)"
      path: "glintscanner/docs/specs/03-crawl.md"
---

# Layer 1 Discovery Remediation Protocol (ARS 2.0 Layer 1)

## 1. Executive Context & The Discovery Gap

Autonomous coding agents (Cursor, Claude Code, Windsurf) and research agents (Perplexity, GPTBot, SearchGPT) begin every developer interaction by attempting to locate the documentation entrypoints, API catalogs, and machine manifests for a domain.

* **The Problem**: 
  1. Default `robots.txt` configurations indiscriminately block modern AI user-agents (`ClaudeBot`, `GPTBot`, `PerplexityBot`), preventing agents from indexing developer docs.
  2. Documentation sites ship hundreds of thousands of lines of heavy navigation HTML, overwhelming agent token context windows with boilerplate instead of dense, usable API knowledge.
  3. Lack of unified machine entrypoints (`ard.json`, `llms.txt`) forces agents to perform fragile multi-hop web scraping.
* **The Solution**: Glintbase Layer 1 mandates a **trio of discovery manifests**:
  * **`public/robots.txt`**: Permissive crawler policy for authorized AI agents with explicit `Content-Signals`.
  * **`public/llms.txt` & `public/llms-full.txt`**: Structured, token-curated plain text directories linking to canonical endpoints.
  * **`public/.well-known/ard.json`**: Standardized Agent Resource Discovery manifest pointing to all machine surfaces.

---

## 2. Canonical Artifact Specifications

### 2.1 Artifact 1: `public/robots.txt` (AI Crawler Policy)
* **Location**: Root web path `/robots.txt`.
* **Rules**:
  * Explicitly allow AI search and retrieval engines.
  * Optionally disallow high-volume scraper/training bots (`CCBot`) if desired.
  * Include `Content-Signals` directive (Search permitted, Training opt-out).

```txt
# Glintbase Agent-Ready robots.txt
# Permits AI search and answer engines while preserving intellectual property

User-agent: ClaudeBot
Allow: /

User-agent: GPTBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

# Disallow aggressive scraping crawlers
User-agent: CCBot
Disallow: /

# Content Signals Protocol
# https://contentsignals.org
Content-Signals: search=yes, ai-train=no
```

### 2.2 Artifact 2: `public/llms.txt` (Agent Documentation Directory)
* **Location**: Root web path `/llms.txt` and optionally `/.well-known/llms.txt`.
* **Format**: Markdown plain-text (`text/plain` or `text/markdown`).
* **Quality Criteria** (per Glintbase SPEC-02):
  * **Length**: Must exceed 40 characters after trim.
  * **H1 Title**: Must start with `# {ProjectName}`.
  * **Summary**: Single blockquote summarizing platform core value proposition (`> ...`).
  * **Sections**: H2 headers (`## Overview`, `## Key APIs & Resources`, `## Guides`).
  * **Machine Links**: Must point to `/auth.md`, `/openapi.json`, and core documentation roots.

```markdown
# Acme Platform

> Unified infrastructure API for identity, machine credentials, and billing automation.

## Overview
- [Documentation](https://docs.acme.com): Complete guides and developer reference
- [Quickstart Guide](https://docs.acme.com/quickstart): 5-minute onboarding tutorial
- [Authentication](https://acme.com/auth.md): Machine authentication handbook
- [OpenAPI Specification](https://api.acme.com/openapi.json): Full machine-readable API catalog
- [Model Context Protocol](https://acme.com/api/mcp): Live Streamable MCP server endpoint

## Key APIs & Resources
- [Identity & Auth](https://docs.acme.com/api/auth): Machine token creation and API keys
- [Webhooks](https://docs.acme.com/api/webhooks): Event delivery and signature verification
- [Rate Limits](https://docs.acme.com/api/rate-limits): Tier definitions and headers
```

### 2.3 Artifact 3: `public/.well-known/ard.json` (Agent Resource Discovery)
* **Location**: `/.well-known/ard.json`.
* **Specification**: ARD Standard v0.91.

```json
{
  "ard_version": "0.91",
  "name": "Acme Platform",
  "description": "Unified infrastructure API for identity and billing automation",
  "endpoints": {
    "llms_txt": "/llms.txt",
    "llms_full_txt": "/llms-full.txt",
    "auth": "/auth.md",
    "openapi": "/openapi.json",
    "mcp": "/api/mcp",
    "sitemap": "/sitemap.xml"
  },
  "metadata": {
    "documentation_root": "https://docs.acme.com",
    "status_page": "https://status.acme.com"
  }
}
```

---

## 3. Step-by-Step Remediation Workflow

### Phase 1: Local Workspace Inspection
1. Scan local documentation directories (`/docs`, `/content`, `.mdx`, `.md`).
2. Identify target public directory:
   * Next.js, Vite, Astro, Remix -> `./public/`
   * Express, FastAPI, Django -> `./static/` or root `./public/`.
3. Check for existing `robots.txt`, `llms.txt`, and `ard.json`.

### Phase 2: Generation & Token Budgeting
1. Generate `robots.txt` ensuring AI user-agents and Content-Signals are present.
2. Index local docs to generate a concise, token-budgeted `llms.txt` (< 2,000 tokens).
3. If deep documentation is present, optionally generate `public/llms-full.txt` concatenating core markdown text.
4. Output `.well-known/ard.json` linking all discovered endpoints.

### Phase 3: Sandbox Verification
1. Verify `robots.txt` contains `ClaudeBot`, `GPTBot`, and `Content-Signals`.
2. Verify `llms.txt` conforms to H1/blockquote/link structure with 0 HTML error tags.
3. Verify `ard.json` parses as valid JSON with non-empty `endpoints`.

---

## 4. Anti-Patterns & Verification Checklist

| Anti-Pattern | Agent Consequence | Glintbase ARS Penalty |
| :--- | :--- | :--- |
| **`User-agent: * Disallow: /`** | Complete agent crawler lockout | -10 pts in Discovery |
| **Empty or HTML `llms.txt`** | Soft-404 page causing agent hallucinations | Flagged `invalid`, caps at 0/10 pts |
| **Missing Content-Signals** | Fails modern AI search attribution standards | -5 pts in Discovery |
| **Missing `/auth.md` Link** | Agents fail authentication journey | Pathfinder journey failure |

### Verification Command:
```bash
glintbase check http://localhost:3000 robots.txt,llms.txt
```
Expected impact: **+20 to +25 points** in Layer 1 Discovery.

---

## 5. Research Sources & Normative Citations

1. **The `/llms.txt` Proposal**:
   * Specification: [llmstxt.org](https://llmstxt.org)
   * Architecture and Design rationale: Jeremy Howard / Answer.ai (2024)
   * Directory format & token curation: [llmstxt.org/directory](https://llmstxt.org/directory)
2. **Content Signals Protocol**:
   * Specification: [contentsignals.org](https://contentsignals.org)
   * Header and Directive Syntax: `Content-Signals: search=yes, ai-train=no`
3. **Agent Resource Discovery (ARD)**:
   * Specification: [ard-spec.org](https://ard-spec.org) (v0.91)
   * Manifest schema and auto-discovery locations (`/.well-known/ard.json`)
4. **Glintbase Scanner Specifications**:
   * Surface Discovery Specification: [`glintscanner/docs/specs/02-discovery.md`](file:///c:/Users/USER/Desktop/glintbase/glintscanner/docs/specs/02-discovery.md)
   * Crawl & Zero-Dependency Embedded-Data Recovery: [`glintscanner/docs/specs/03-crawl.md`](file:///c:/Users/USER/Desktop/glintbase/glintscanner/docs/specs/03-crawl.md)
   * ARS 1.0/2.0 Scoring Methodology: [`glintscanner/docs/methodology/ars-1.0.md`](file:///c:/Users/USER/Desktop/glintbase/glintscanner/docs/methodology/ars-1.0.md)


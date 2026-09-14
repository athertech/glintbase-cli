# @glintbase/cli

> **Glintbase Agent Harness (ARS 3.0)** — Autonomous Agent-Readiness Auditor, Flight Simulator & CI Drift Shield.

[![Version](https://img.shields.io/npm/v/@glintbase/cli.svg?style=flat&color=3b82f6)](https://www.npmjs.com/package/@glintbase/cli)
[![License](https://img.shields.io/badge/license-Apache--2.0-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-134%20passing-brightgreen.svg)](tests/)
[![Node](https://img.shields.io/badge/node-%3E%3D20-blue.svg)](https://nodejs.org)

---

## Overview

AI coding agents (**Claude Code**, **Cursor**, **Codex**, **Antigravity**, **OpenCode**) and autonomous answer engines (**ChatGPT Search**, **Perplexity**) are rapidly becoming the primary consumers of web documentation, SDKs, and developer APIs. 

However, **90%+ of web services fail when accessed by autonomous agents**:
- Non-existent doc paths return **HTTP 200 Single-Page Application (SPA) HTML shells**, causing agents to hallucinate non-existent API parameters.
- APIs hide authentication requirements behind human web dashboards instead of machine-readable **`auth.md`** handbooks.
- Sites lack standardized **Model Context Protocol (MCP)** endpoints, forcing agents to burn tens of thousands of tokens scraping HTML.
- `robots.txt` files unintentionally block AI agent user-agents.

**Glintbase is the engineering infrastructure layer that audits, simulates, and remediates software for autonomous agents.**

---

## Quickstart

Run directly with `npx` (no global install required):

```bash
# Run full ARS 3.0 audit against any public URL
npx @glintbase/cli audit https://api.example.com

# Or audit your local codebase
npx @glintbase/cli audit .
```

Or install globally:

```bash
npm install -g @glintbase/cli
```

---

## Core Commands

### 1. `glintbase audit [target]`
Executes the comprehensive **ARS 3.0** (Agent Readiness Standard) audit across all 119 protocol checks and 4 operational layers with dynamic denominator scoring:
- **Layer 1: Discovery** (`robots.txt`, `ard.json`, agent prompt rules, Wikidata claims).
- **Layer 2: Access & Understanding** (No-JS SSR density, `llms.txt`, `Accept: text/markdown`, Anti-SPA 404 canaries).
- **Layer 3: Usability & Interoperability** (Streamable HTTP MCP, typed tool schemas, WorkOS `auth.md`, RFC 9728).
- **Layer 4: Payments & Commerce** (UCP/ACP manifests, x402 micropayments — non-commerce sites get unpenalized `N/A`).

```bash
# Basic audit
glintbase audit https://api.example.com

# Audit with embedded Agent Flight Simulator
glintbase audit https://api.example.com --simulate

# Export comprehensive executive Markdown audit report
glintbase audit https://api.example.com --report report.md

# Enforce strict score threshold in scripts
glintbase audit . --fail-under 80
```

---

### 2. `glintbase simulate [target]`
Empirical **Autonomous Agent Flight Simulator**. Evaluates how real agent personas navigate, ingest, authenticate, execute tools, and recover from errors against your target.

```bash
# Simulate using Claude Code persona (200k context)
glintbase simulate https://api.example.com --agent claude-code

# Simulate using Cursor IDE persona (128k context)
glintbase simulate . --agent cursor

# Test a custom natural language mission intent
glintbase simulate https://api.example.com -i "query recent invoice status"

# Dry-run mutation safety (safe by default, passes synthetic dry-runs)
glintbase simulate https://api.example.com -i "delete database cluster"

# Authorize live network mutations if desired
glintbase simulate https://api.example.com --allow-mutations

# Machine-readable JSON telemetry for pipelines
glintbase simulate https://api.example.com --json
```

**Simulator Capabilities:**
- **Personas Supported**: `claude-code`, `cursor`, `perplexity`.
- **Token Tax & Dollar Cost**: Real-time dollar cost calculated per agent session ($3/M in, $15/M out).
- **Schema Friction Index**: 0 (Flawless) to 100 (Hostile) scoring tool input schemas for missing required parameters, parameter/description unit contradictions, and ambiguous types.
- **Counterfactual "What-If" Sandbox**: Mounts virtual fixes in-memory to prove exact token savings and latency reductions before touching disk.

---

### 3. `glintbase fix [target]`
Autonomous doctor and code remediation engine. Synthesizes living agent specifications and patches directly into your project.

```bash
# Interactive single-key review of AST-generated patches
glintbase fix

# Automatically apply all recommended fixes
glintbase fix -y

# 1-Click Git PR Staging: creates branch, generates patches, commits, and provides PR snippet
glintbase fix --branch glintbase/agent-readiness
```

**Synthesizes:**
- `public/llms.txt` and `public/llms-full.txt` (H1 project index & token-budgeted markdown catalog).
- `public/auth.md` (WorkOS-compliant machine authentication guide with YAML frontmatter).
- `public/robots.txt` (AI crawler permissions with Content-Signals).
- `public/.well-known/ard.json` (Agent Resource Discovery v0.91 manifest).
- `app/api/mcp/route.ts` (Streamable HTTP Model Context Protocol handler).
- `app/not-found.tsx` / `pages/404.tsx` / Express 404 (Anti-SPA route returning true HTTP 404 status).

---

### 4. `glintbase ci [url]`
Enterprise CI/CD quality gate and PR drift detector for GitHub Actions, GitLab CI, and CircleCI.

```bash
# Run CI quality gate (exit code 1 if score drops below threshold)
glintbase ci https://staging.example.com --fail-under 80

# Run with PR drift detection against base branch
glintbase ci . --fail-under 75 --pr-drift
```

---

## GitHub Action Integration

Add Glintbase as an automated PR drift shield in `.github/workflows/agent-readiness.yml`:

```yaml
name: Agent Readiness Drift Shield

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  glintbase:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run Glintbase ARS 3.0 Quality Gate
        uses: ./action.yml
        with:
          target: '.'
          fail-under: 75
          comment: true
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Every pull request receives a sticky Markdown comment highlighting:
- ARS 3.0 Composite Score & Grade.
- Score drift delta against the base branch (`+8 pts` or `-12 pts`).
- Committable GitHub suggestions ready for 1-click merge.

---

## Specifications & Standards Supported

- **ARS 3.0**: Dynamic-denominator Agent Readiness Standard (119 checks).
- **Model Context Protocol (MCP)**: Streamable HTTP and SSE transports (Anthropic spec 2024-11-05).
- **W3C WebMCP**: Browser-native `window.modelContext` and dynamic `registerTool` client architecture.
- **Agentic Resource Discovery (ARD)**: Specification v0.91 (`.well-known/ard.json`).
- **WorkOS `auth.md`**: Machine-readable authentication documentation standard.
- **RFC 9728**: OAuth 2.0 Protected Resource Metadata.
- **RFC 7807**: Problem Details for HTTP APIs.
- **Content-Signals**: `search=yes, ai-train=no`.

---

## Development & Publishing

### Local Development
```bash
# Clone the repository
git clone https://github.com/athertech/glintbase-cli.git
cd glintbase-cli

# Install dependencies
npm install

# Run TypeScript typechecker
npm run typecheck

# Run Vitest test suite
npm test

# Build production bundle with tsup
npm run build

# Run locally in development mode
npm run dev -- audit .
```

### Publishing to npm

The package is published under `@glintbase/cli`:

```bash
# Ensure you are logged into npm
npm whoami

# Check package contents before publishing
npm pack --dry-run

# Publish public package (prepublishOnly runs typecheck, test, and build automatically)
npm publish --access public
```

---

## License

[Apache-2.0](LICENSE) © Glintbase

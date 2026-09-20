# Contributing to @glintbase/cli

Thank you for your interest in contributing to Glintbase! This repository contains `@glintbase/cli` — the autonomous agent-readiness auditor (ARS 3.0), Flight Simulator, and CI drift shield.

---

## Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for all contributors. Please be kind, constructive, and respectful in all interactions.

---

## Development Setup

### Prerequisites
- **Node.js**: `v20.0.0` or higher
- **npm**: `v10.0.0` or higher
- **Git**

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/athertech/glintbase-cli.git
cd glintbase-cli

# 2. Install dependencies
npm install

# 3. Verify TypeScript compiles cleanly
npm run typecheck

# 4. Run the full test suite (158 unit & integration tests)
npm test

# 5. Build the production bundle
npm run build
```

---

## Project Architecture

```
src/
├── ast/                 # AST parsers and generator templates (llms.txt, auth.md, ard.json, etc.)
├── commands/            # CLI commands (audit, simulate, fix, ci, mcp)
├── core/                # Core audit runner & protocol probes
│   ├── probes/          # Discovery, Access, and Usability ARS 3.0 probes
│   ├── security/        # Canary routes, auth verifier, mutation auditor, compliance reporter
│   ├── sandbox.ts       # In-memory virtual AST sandbox
│   └── urlPolicy.ts     # Target URL resolution & SSRF protection
├── mcp/                 # Model Context Protocol server
│   ├── server.ts        # Stdio & HTTP SSE server setup
│   ├── tunnel.ts        # Ephemeral Cloudflare Quick Tunnel provider
│   ├── tools/           # 17 composable production MCP tools
│   └── skills/          # 9 bundled agent optimization skills
├── output/              # Terminal formatters (picocolors, ora, tables)
├── session/             # Agent session brain & workspace state
└── simulator/           # Empirical Agent Flight Simulator
    ├── engines/         # Deterministic & LLM simulation engines
    ├── telemetry/       # Token tax & schema friction indexes
    └── visual/          # Multi-modal SVG journey tree & deflated state hash generator
```

---

## Development Workflow

### Running Locally
You can execute the CLI directly against TypeScript sources during development:

```bash
# Run audit against a URL
npm run dev -- audit https://api.stripe.com

# Run audit against current workspace
npm run dev -- audit .

# Run agent flight simulator
npm run dev -- simulate https://api.stripe.com --agent claude-code

# Start local MCP server
npm run dev -- mcp
```

### Adding New Protocol Probes
1. Probes live in `src/core/probes/` (`discovery.ts`, `access.ts`, `usability.ts`).
2. Each probe must return an array of `ProbeCheck` objects with:
   - `id`: Unique check identifier (e.g., `DISC-ROBOTS-VALID`).
   - `name`: Human-readable title.
   - `passed`: Boolean pass/fail status.
   - `importance`: `"critical"` | `"standard"` | `"advisory"`.
   - `penalty`: Numerical weight deduction if failed.
   - `reason`: Crisp explanation of what was evaluated.
3. Write corresponding unit tests in `tests/` verifying both pass and fail scenarios.

### Adding New MCP Tools
1. Register tools in `src/mcp/tools/index.ts` using `@modelcontextprotocol/sdk`.
2. Provide strict Zod input schemas with helpful descriptions.
3. Return structured JSON with concise, high-density token economy.

---

## Quality Gates & Pull Requests

Before submitting a Pull Request:
1. **Typecheck**: `npm run typecheck` must pass with zero errors.
2. **Tests**: `npm test` must pass all test suites.
3. **Build**: `npm run build` must produce clean outputs in `dist/`.
4. **Self-Audit**: Run `node dist/index.js audit .` to ensure the codebase maintains an ARS score ≥ 75.

### Commit Conventions
We follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat: ...` for new features or probes
- `fix: ...` for bug fixes
- `docs: ...` for documentation updates
- `test: ...` for test additions or refactors
- `perf: ...` for performance improvements

---

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).

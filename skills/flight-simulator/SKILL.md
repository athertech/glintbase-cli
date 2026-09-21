---
name: flight-simulator
description: Interpreting synthetic coding agent runs across Claude Code, Cursor, Perplexity, and Swarm personas.
---

# Agent Flight Simulator Diagnostic & Replay

The Glintbase Flight Simulator executes synthetic agent personas against documentation and API endpoints to identify failure states before real users encounter them.

## The 4 Personas
1. **Claude Code**: Rigorous command-line agent. Relies on `llms.txt` and fast grep/curl exploration. Fails when SPA 404 routes return HTTP 200.
2. **Cursor Agent**: IDE context-driven agent. Reads local rule files (`.cursor/`) and prefers concise API signatures. Fails on undocumented auth headers.
3. **Perplexity Agent**: Answer-engine retrieval persona. Scans documentation headers and searches for quickstart code blocks. Fails on JavaScript-rendered text shells.
4. **Autonomous Swarm**: Parallel multi-agent swarm. Executes multiple sub-tasks simultaneously. Fails when rate-limit headers are missing or endpoints lack idempotency.

## How to Run
Use the MCP tool `glintbase_simulate_flight`:
```json
{
  "target": ".",
  "persona": "claude-code",
  "intent": "Authenticate with API and query resource"
}
```

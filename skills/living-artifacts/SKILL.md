---
name: living-artifacts
description: Guidelines and templates for designing high-density, token-budgeted llms.txt, llms-full.txt, and ARD manifests.
---

# Living Artifacts Specification (llms.txt & ard.json)

Living artifacts are self-updating, machine-readable specifications placed at root HTTP paths to guide autonomous AI agents directly to the most critical information while avoiding context-window bloat.

## 1. /llms.txt Standard

Location: `/public/llms.txt` or root `llms.txt`
Maximum Token Budget: 25,000 tokens (Recommended: 2,000 - 8,000 tokens).

### Standard Template:
```markdown
# Product Name Documentation

> Concise one-sentence summary of what this platform does and its primary capabilities.

## Core API & Quickstart
- [Quickstart Guide](https://docs.example.com/quickstart.md): 5-minute guide to initial authentication and first API call.
- [Authentication Protocol](https://docs.example.com/auth.md): API keys, Bearer tokens, and WorkOS machine flows.
- [API Reference](https://api.example.com/openapi.json): Full OpenAPI 3.1 specification.

## Core Workflows
- [Manage Resources](https://docs.example.com/resources.md): CRUD operations for core domain entities.
- [Webhook Subscriptions](https://docs.example.com/webhooks.md): Event payload schemas and signature verification.

## MCP & Agent Entrypoints
- [Model Context Protocol](https://api.example.com/api/mcp): Streamable HTTP MCP server endpoint.
```

## 2. /.well-known/ard.json Standard

Agentic Resource Discovery (ARD v0.91) defines machine-verifiable discovery metadata:
```json
{
  "ardVersion": "0.91",
  "urn": "urn:air:example.com:core",
  "name": "Example API",
  "description": "Autonomous developer platform for cloud services.",
  "endpoints": {
    "llms": "/llms.txt",
    "auth": "/auth.md",
    "mcp": "/api/mcp",
    "openapi": "/openapi.json"
  },
  "trustManifest": {
    "signedBy": "security@example.com",
    "algorithm": "Ed25519"
  }
}
```

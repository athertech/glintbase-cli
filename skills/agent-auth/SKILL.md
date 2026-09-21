---
name: agent-auth
description: Autonomous machine authentication standards, WorkOS auth.md schema, OAuth2 client credentials, and HTTP headers.
---

# Agent Authentication Handbook (WorkOS auth.md)

Autonomous coding agents cannot navigate interactive CAPTCHAs, SMS 2FA prompts, or human SSO dashboards. Platform maintainers must expose machine-readable onboarding protocols via `/auth.md`.

## 1. WorkOS auth.md Frontmatter Standard

Location: `/public/auth.md` or `/.well-known/auth.md`

```markdown
---
title: Machine & Agent Authentication Protocol
auth_schemes:
  - api_key
  - oauth2_client_credentials
endpoints:
  token: https://api.example.com/oauth/token
  revoke: https://api.example.com/oauth/revoke
headers:
  authorization: "Bearer <token>"
  agent_id: "X-Agent-ID"
  idempotency: "X-Idempotency-Key"
rate_limits:
  header_limit: "RateLimit-Limit"
  header_remaining: "RateLimit-Remaining"
  header_reset: "RateLimit-Reset"
---

# Agent Authentication Guide

## 1. Using API Keys
Autonomous callers provide their provisioned API key in the standard Authorization header:
```http
GET /v1/account HTTP/1.1
Host: api.example.com
Authorization: Bearer sec_live_948f293b
X-Agent-ID: claude-code-workspace-1
```

## 2. Machine-to-Machine OAuth2
Request temporary tokens using client credentials:
```bash
curl -X POST https://api.example.com/oauth/token 
  -d "grant_type=client_credentials" 
  -d "client_id=$CLIENT_ID" 
  -d "client_secret=$CLIENT_SECRET"
```
```

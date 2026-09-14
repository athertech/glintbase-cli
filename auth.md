---
title: Machine-Readable Authentication Guide
version: 1.0
auth_scheme: Bearer
token_endpoint: https://api.glintbase.xyz/api/auth/token
scopes:
  - read
  - write
  - agent
---
# Machine-Readable Authentication Guide

> Standardized authentication manual for autonomous AI agents integrating with @glintbase/cli.
> Specification conformance: WorkOS `auth.md` & RFC 9728.

## Overview

This service supports agentic authentication via HTTP Bearer Tokens (OAuth 2.1 / API Keys).

- **Authentication Method**: `Bearer <access_token>`
- **Header**: `Authorization`
- **Token Endpoint**: `https://api.example.com/api/auth/token`
- **Metadata Discovery**: `https://api.example.com/.well-known/oauth-protected-resource`

## Authentication Flows

### 1. Bearer Token Authorization

Include the API access token in the `Authorization` HTTP header on all API requests:

```http
GET /api/v1/resource HTTP/1.1
Host: api.example.com
Authorization: Bearer <YOUR_API_KEY_OR_JWT>
Accept: application/json
```

### 2. Autonomous Token Acquisition

Agents with client credentials can request machine-to-machine tokens:

```http
POST https://api.example.com/api/auth/token HTTP/1.1
Host: api.example.com
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "<CLIENT_ID>",
  "client_secret": "<CLIENT_SECRET>",
  "scope": "read write"
}
```

## Standard Error Codes

| Status Code | Meaning | Agent Action |
|---|---|---|
| `401 Unauthorized` | Missing or expired token | Refresh token or re-authenticate via `https://api.example.com/api/auth/token` |
| `403 Forbidden` | Insufficient permissions/scope | Request additional scopes or escalate credentials |
| `429 Too Many Requests` | Rate limit exceeded | Backoff exponentially according to `Retry-After` header |

## Scopes & Permissions

- `read`: Full read access to documents and public APIs
- `write`: Modify user-owned resources
- `agent`: Autonomous tool execution scope

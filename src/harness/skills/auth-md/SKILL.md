---
name: auth-md-skill
description: Authoritative standard for implementing WorkOS auth.md specifications and RFC 9728 OAuth Protected Resource discovery metadata for autonomous AI agents and headless service accounts.
layer: usability
version: 2.0.0
metadata:
  standard: WorkOS auth.md Standard & RFC 9728
  points_impact: 20
  target_runtimes: [All API Platforms, SaaS, DevTools]
  research_sources:
    - title: "WorkOS auth.md Initiative"
      url: "https://workos.com/blog/auth-md"
    - title: "RFC 9728: OAuth 2.0 Protected Resource Metadata"
      url: "https://datatracker.ietf.org/doc/rfc9728/"
    - title: "RFC 6749: The OAuth 2.0 Authorization Framework"
      url: "https://datatracker.ietf.org/doc/html/rfc6749"
    - title: "IETF RateLimit Header Fields for HTTP"
      url: "https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/"
    - title: "Glintbase ARS 2.0 Usability Probe Specification"
      path: "glintscanner/src/lib/scanner/v2/probes/usability.ts"
---

# Agent Authentication Specification Protocol (ARS 2.0 Layer 3)

## 1. Executive Context & The Authentication Deadlock

Autonomous AI coding agents frequently hit an insurmountable deadlock when attempting to use developer platforms:
1. **Interactive Deadlock**: Platforms require human sign-up flows (Google OAuth popups, CAPTCHA puzzles, SMS 2FA) which headless coding agents cannot resolve.
2. **Missing Credential Guidance**: Documentation scatters key generation across multi-step UI tutorials without machine-readable instructions on header formats, token endpoints, or bearer formats.
3. **Silent Rate-Limit Throttling**: Platforms throttle agent requests without standardized IETF `RateLimit-*` headers, causing agents to interpret 429 errors as permanent code bugs.

The **WorkOS `auth.md` standard** and **RFC 9728 OAuth Protected Resource discovery** solve this by providing machine-readable manuals instructing agents exactly how to authenticate.

---

## 2. Canonical Artifact Specifications

### 2.1 Artifact 1: `public/auth.md` (WorkOS Specification)
* **Location**: `/auth.md`, `/.well-known/auth.md`, or `/docs/auth.md`.
* **Format**: Markdown with structured YAML frontmatter.

```markdown
---
title: Agent Authentication Handbook
version: 1.0.0
target: Acme Platform
auth_schemes:
  - api_key
  - oauth2_client_credentials
endpoints:
  token: https://api.acme.com/oauth/v2/token
  keys: https://dashboard.acme.com/api-keys
  revocation: https://api.acme.com/oauth/v2/revoke
---

# Agent Authentication Protocol

This handbook instructs autonomous AI agents on authenticating requests to **Acme Platform**.

## 1. API Key Authentication (Recommended for Agents)
Pass your API secret key in the `Authorization` HTTP header:

```http
GET /api/v1/resource HTTP/1.1
Host: api.acme.com
Authorization: Bearer YOUR_API_KEY
```

* **Header Format**: `Authorization: Bearer acme_live_...` or `Authorization: Bearer acme_test_...`.
* **Obtaining Keys**: Service keys can be provisioned via the developer console at `https://dashboard.acme.com/api-keys`.

## 2. OAuth2 Client Credentials (Headless Service Accounts)
Autonomous agents operating service accounts can request short-lived machine access tokens:

```http
POST /oauth/v2/token HTTP/1.1
Host: api.acme.com
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET
```

### Response Schema:
```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "read write"
}
```

## 3. Rate Limits & Headers
Standard IETF RateLimit headers are returned on all endpoints:
* `RateLimit-Limit`: Maximum requests permitted per window.
* `RateLimit-Remaining`: Remaining request budget in the current window.
* `RateLimit-Reset`: Unix epoch seconds until window quota resets.

### Handling 429 Too Many Requests:
When throttled, inspect the `Retry-After` header (seconds) before retrying. Do not trigger exponential retry storms.
```

### 2.2 Artifact 2: `public/.well-known/oauth-protected-resource` (RFC 9728)
* **Location**: `/.well-known/oauth-protected-resource`.
* **Content-Type**: `application/json`.
* **Specification**: RFC 9728 OAuth 2.0 Protected Resource Metadata.

```json
{
  "resource": "https://api.acme.com",
  "authorization_servers": [
    "https://auth.acme.com"
  ],
  "scopes_supported": [
    "read",
    "write",
    "admin"
  ],
  "bearer_methods_supported": [
    "header"
  ],
  "resource_documentation": "https://acme.com/auth.md"
}
```

---

## 3. Step-by-Step Remediation Workflow

### Phase 1: Workspace Auth Inspection
1. Inspect project environment variables (`.env.example`) to detect auth schemes:
   * `API_KEY`, `BEARER_TOKEN`, `SECRET_KEY` -> `api_key` scheme.
   * `CLIENT_ID`, `CLIENT_SECRET` -> `oauth2_client_credentials`.
   * `JWT_SECRET` -> bearer token scheme.
2. Identify token minting endpoints or authentication middleware in routes.

### Phase 2: Generation & Structure Validation
1. Draft `public/auth.md` ensuring:
   * YAML frontmatter has `title`, `version`, `target`, and `auth_schemes`.
   * Body explicitly includes `Authorization: Bearer <key>` snippet.
   * IETF `RateLimit-*` headers are documented.
2. Generate RFC 9728 JSON discovery metadata at `public/.well-known/oauth-protected-resource`.

### Phase 3: Sandbox Verification
1. Verify `auth.md` has valid frontmatter.
2. Verify `auth_schemes` array is populated.
3. Verify RFC 9728 metadata is valid JSON with `authorization_servers` and `resource`.

---

## 4. Anti-Patterns & Verification Checklist

| Anti-Pattern | Agent Consequence | Glintbase ARS Penalty |
| :--- | :--- | :--- |
| **Missing `auth.md`** | Agent halts when facing authentication prompts | -15 pts in Usability |
| **Missing YAML Frontmatter** | Machine parsers cannot extract endpoints programmatically | Sandbox rejection |
| **Custom Header without Docs** | Agent defaults to `Authorization: Bearer` and gets 401 | Pathfinder journey failure |

### Verification Command:
```bash
glintbase check http://localhost:3000 auth.md
```
Expected impact: **+15 to +20 points** in Layer 3 Usability.

---

## 5. Research Sources & Normative Citations

1. **WorkOS `auth.md` Initiative**:
   * Specification: [workos.com/blog/auth-md](https://workos.com/blog/auth-md)
   * Repository & Examples: [github.com/workos/auth-md](https://github.com/workos/auth-md)
   * Pattern: Machine-readable YAML frontmatter + Bearer scheme definition
2. **RFC 9728: OAuth 2.0 Protected Resource Metadata**:
   * IETF RFC: [datatracker.ietf.org/doc/rfc9728/](https://datatracker.ietf.org/doc/rfc9728/)
   * Discovery Endpoint: `/.well-known/oauth-protected-resource`
3. **IETF RateLimit Header Fields for HTTP**:
   * Internet-Draft: [datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/)
   * Headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`
4. **Glintbase Usability Probe Engine**:
   * Specification: [`glintscanner/src/lib/scanner/v2/probes/usability.ts`](file:///c:/Users/USER/Desktop/glintbase/glintscanner/src/lib/scanner/v2/probes/usability.ts)


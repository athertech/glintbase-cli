# WorkOS auth.md & RFC 9728 Reference Specification

## Frontmatter Schema
```yaml
---
title: string # "Agent Authentication Handbook"
version: string # "1.0.0"
target: string # Name of the target platform/API
auth_schemes: # List of supported machine authentication schemes
  - api_key
  - oauth2_client_credentials
endpoints: # Key endpoints for machine operations
  token?: string # URL for OAuth2 token exchanges
  keys?: string # URL to self-serve API keys in dashboard
  revocation?: string # URL to revoke credentials
---
```

## RFC 9728 OAuth Protected Resource Metadata
Endpoints exposing OAuth protection should serve:
`GET /.well-known/oauth-protected-resource`
```json
{
  "resource": "https://api.example.com",
  "authorization_servers": ["https://auth.example.com"],
  "scopes_supported": ["read", "write"],
  "bearer_methods_supported": ["header"],
  "resource_documentation": "https://example.com/auth.md"
}
```

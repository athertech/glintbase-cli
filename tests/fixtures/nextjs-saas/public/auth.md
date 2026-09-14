---
title: Agent Authentication Handbook
version: 1.0.0
target: Next.js SaaS Platform
auth_schemes:
  - api_key
  - bearer_token
endpoints:
  token: /api/auth
---

# Agent Authentication Protocol

Autonomous agents must authenticate using Bearer tokens issued via `/api/auth`.

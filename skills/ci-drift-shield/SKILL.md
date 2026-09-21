---
name: ci-drift-shield
description: Setting up automated GitHub Actions to block score regressions and post interactive PR comments.
---

# Zero-Drift CI Quality Gate & PR Shield

Prevent regressions in your developer documentation and machine interfaces by adding the Glintbase Quality Gate to your GitHub Actions workflow.

## GitHub Actions Configuration (`.github/workflows/ci.yml`)

```yaml
name: Glintbase Agent Readiness Gate
on: [push, pull_request]

jobs:
  agent-readiness:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Codebase
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run Glintbase CI Gate
        run: npx -y @glintbase/cli@latest ci . --fail-under 75 --comment
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

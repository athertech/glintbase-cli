---
name: token-tax-schema
description: Techniques for minimizing prompt bloat and eliminating ambiguous OpenAPI / MCP schemas that trigger hallucinations.
---

# Token Tax & Schema Friction Elimination

## 1. The Token Tax Formula
The **Token Tax** measures the ratio of non-executable tokens (navbars, tracking scripts, CSS, repetitive marketing copy) an agent must ingest before reaching actionable API parameters:

$$text{Prompt Bloat Multiplier} = frac{text{Raw Page Tokens}}{text{Semantic Markdown Tokens}}$$

Target: Bloat Multiplier $le 1.8times$. Unoptimized sites regularly exceed $12.5times$, wasting millions of tokens.

## 2. Eliminating Schema Friction
LLMs hallucinate parameters when schemas lack explicit descriptions or use loose types:
- **Never use `type: "object"` without `properties`**: Define explicit nested types.
- **Always specify `required: [...]**`: Explicitly enumerate mandatory fields.
- **Provide semantic descriptions**: Every property should explain its format, unit, and example.
- **Use String Enums instead of arbitrary text**: Restrict valid inputs using `enum: ["USD", "EUR"]`.

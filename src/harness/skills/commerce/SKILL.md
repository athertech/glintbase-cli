---
name: commerce-skill
description: Comprehensive standard for implementing Machine Payments Protocol (MPP), x402 Payment Required micropayment headers, and Universal Commerce Protocol (UCP) specifications for autonomous commerce.
layer: payments
version: 2.0.0
metadata:
  standard: UCP v1.0, MPP v1.0.0, RFC 9110 HTTP 402 / x402
  points_impact: 20
  target_runtimes: [E-Commerce, Marketplaces, Paid API Services]
  research_sources:
    - title: "Universal Commerce Protocol (UCP) Specification"
      url: "https://github.com/agent-commerce/ucp"
    - title: "Machine Payments Protocol (MPP) Architecture"
      url: "https://machinepayments.org"
    - title: "x402: Internet Native Micropayments Protocol"
      url: "https://x402.org"
    - title: "RFC 9110: HTTP Semantics (Status Code 402)"
      url: "https://datatracker.ietf.org/doc/html/rfc9110#section-15.5.3"
    - title: "Glintbase Payments Probe Specification"
      path: "glintscanner/src/lib/scanner/v2/probes/payments.ts"
---

# Machine Commerce & Micropayments Protocol (ARS 2.0 Layer 4)

## 1. Executive Context & Machine Settlement

Autonomous buyer agents (shopping assistants, supply chain agents, automated inventory replenishment) cannot complete checkout flows designed for human consumers:
1. **Interactive Cart Checkout**: Multi-step human forms with shipping address drop-downs, credit card iframes (Stripe Elements), and 3DS verification modals break autonomous agents.
2. **Missing Rate Cards & Settlement Protocols**: Machines cannot negotiate per-request pricing, token settlement (USDC, Lightning, agent vouchers), or rate limits programmatically.
3. **Dynamic Archetype Denominator**: In Glintbase ARS 2.0, non-commerce sites (`devtool`, `saas`, `publisher`) exclude the Payments layer from their scoring denominator. However, when an **`ecommerce`** archetype is detected, Layer 4 contributes **20 points** to the ARS score.

---

## 2. Canonical Artifact Specifications

### 2.1 Artifact 1: Universal Commerce Protocol (`public/.well-known/ucp`)
* **Location**: `/.well-known/ucp` or `/.well-known/ucp/catalog.json`.
* **Format**: JSON catalog and cart entrypoint specification.

```json
{
  "ucp_version": "1.0",
  "merchant": {
    "name": "Acme Storefront",
    "domain": "store.acme.com",
    "currency": "USD"
  },
  "endpoints": {
    "catalog": "/api/ucp/catalog.json",
    "cart": "/api/ucp/cart",
    "checkout": "/api/ucp/checkout",
    "quote": "/api/ucp/quote"
  },
  "supported_settlements": [
    "x402",
    "mpp",
    "stripe_agent_tokens"
  ],
  "agent_policies": {
    "max_autonomous_spend_usd": 100.0,
    "instant_refund_window_hours": 24
  }
}
```

### 2.2 Artifact 2: Machine Payments Protocol (`public/.well-known/mpp.json`)
* **Location**: `/.well-known/mpp.json`.
* **Specification**: Defines settlement rails, machine currency rate cards, and settlement wallets.

```json
{
  "mpp_version": "1.0.0",
  "merchant": "Acme Storefront",
  "settlement_currencies": [
    {
      "asset": "USDC",
      "network": "base",
      "address": "0x1234...5678"
    },
    {
      "asset": "lightning",
      "lnurl": "lnurl1dp68gurn8ghj7mr0vd3kqc..."
    }
  ],
  "rate_limits": {
    "max_single_transaction_usd": 50.0,
    "daily_budget_usd": 1000.0
  }
}
```

### 2.3 Artifact 3: HTTP 402 / x402 Micropayment Headers
* APIs charging micro-fees per operation return standard HTTP 402:
```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
Payment-Required: amount=0.005; currency=USDC; network=base; address=0x1234...5678
Payment-Receipt-Url: /api/payment/verify
```

---

## 3. Step-by-Step Remediation Workflow

### Phase 1: Archetype & Commerce Surface Detection
1. Check if host platform is categorized as `ecommerce` archetype.
2. If non-commerce (`devtool`, `saas`), Layer 4 is marked N/A and does not penalize score.
3. For commerce platforms, scan for catalog routes (`/shop`, `/store`, `/cart`, `/products`).

### Phase 2: Manifest Generation
1. Generate `public/.well-known/ucp` with machine catalog, cart, and checkout paths.
2. Generate `public/.well-known/mpp.json` specifying accepted machine currencies and limits.

### Phase 3: Sandbox Verification
1. Verify `ucp` is valid JSON and exposes non-empty `supported_settlements`.
2. Verify `mpp.json` parses with valid settlement structures.

---

## 4. Verification Checklist

```bash
# Verify Layer 4 payments
glintbase check http://localhost:3000 ucp
```
Expected impact: **+20 points** in Layer 4 Payments for e-commerce platforms.

---

## 5. Research Sources & Normative Citations

1. **Universal Commerce Protocol (UCP)**:
   * Specification: [github.com/agent-commerce/ucp](https://github.com/agent-commerce/ucp)
   * Product Catalog & Cart Standard: [ucp-standard.org](https://ucp-standard.org)
2. **Machine Payments Protocol (MPP)**:
   * Specification: [machinepayments.org](https://machinepayments.org)
   * Architecture & Settlement Rails: Machine Payments Working Group (2024/2025)
3. **RFC 9110 HTTP 402 Payment Required & x402**:
   * RFC 9110 Section 15.5.3: [datatracker.ietf.org/doc/html/rfc9110#section-15.5.3](https://datatracker.ietf.org/doc/html/rfc9110#section-15.5.3)
   * x402 Micropayments Protocol: [x402.org](https://x402.org)
4. **Glintbase ARS 2.0 Dynamic Denominator & Archetype Engine**:
   * Archetype Engine: [`glintscanner/src/lib/scanner/v2/archetype.ts`](file:///c:/Users/USER/Desktop/glintbase/glintscanner/src/lib/scanner/v2/archetype.ts)
   * Payments Probe: [`glintscanner/src/lib/scanner/v2/probes/payments.ts`](file:///c:/Users/USER/Desktop/glintbase/glintscanner/src/lib/scanner/v2/probes/payments.ts)


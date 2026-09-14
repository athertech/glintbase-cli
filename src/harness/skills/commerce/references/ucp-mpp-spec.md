# UCP & MPP Reference Specification

## Universal Commerce Protocol (UCP v1.0)
Endpoints:
`GET /.well-known/ucp`
```json
{
  "ucp_version": "1.0",
  "merchant": {
    "name": "string",
    "domain": "string",
    "currency": "string"
  },
  "endpoints": {
    "catalog": "/api/ucp/catalog.json",
    "cart": "/api/ucp/cart",
    "checkout": "/api/ucp/checkout"
  },
  "supported_settlements": ["x402", "mpp", "stripe_agent_tokens"]
}
```

## Machine Payments Protocol (MPP v1.0)
Endpoints:
`GET /.well-known/mpp.json`
```json
{
  "mpp_version": "1.0.0",
  "merchant": "string",
  "settlement_currencies": [
    {
      "asset": "USDC",
      "network": "base",
      "address": "0x..."
    }
  ],
  "rate_limits": {
    "max_single_transaction_usd": 50.0
  }
}
```

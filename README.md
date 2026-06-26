# B&B Rugchecks

A static, client-side rug-pull risk scanner. Paste a token contract address, pick a chain, and get a 0–100 risk score backed by live data from the [GoPlus Token Security API](https://docs.gopluslabs.io/reference/security-api-1) (no API key required).

## Supported chains

Solana, Ethereum, BNB Chain, Base, Arbitrum, Polygon.

## How it works

- `index.html` / `style.css` — terminal-styled UI (matrix rain, scanline/glow effects).
- `app.js` —
  - Calls `https://api.gopluslabs.io/api/v1/token_security/{chain_id}` for EVM chains, and `https://api.gopluslabs.io/api/v1/solana/token_security` for Solana, directly from the browser.
  - Maps each endpoint's (different) field names into a common shape: mint authority, ownership/freeze authority, LP lock %, honeypot/can-sell, tax %, top-10 holder %, dev/creator wallet %, liquidity USD, holder count.
  - Computes a risk score with the fixed weighting in `computeRisk()` in `app.js` (honeypot/cannot-sell forces 100; otherwise additive point buckets, capped at 100). Bands: 0–20 pass, 21–60 warning, 61–100 critical.
  - Shows a clear message when a token/chain isn't found or supported, instead of failing silently.

No backend, no build step, no API key in the code — it's a plain static site.

## Run locally

```
python3 -m http.server 8000
```

then open `http://localhost:8000`.

## Deploy

**Cloudflare Pages**
1. Push this repo to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect repo.
3. Framework preset: None. Build command: (none). Output directory: `/`.

**Vercel**
1. `npm i -g vercel` (or use the dashboard) → `vercel` in this directory.
2. No build settings needed — it's served as static files.

## Disclaimer

Not financial advice. Always do your own research. Signals are read on-chain at scan time and can change.

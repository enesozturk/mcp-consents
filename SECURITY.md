# Security

## Reporting a problem

If you find a security issue with consents.ozturkenes.com or this code, email
**enesozturk.d@gmail.com** instead of opening a public issue. Include what you found and how to
reproduce it. You will get an answer within a few days.

## What the site does and does not do

- The site and its API are read-only. There are no accounts, cookies, forms or user uploads, and
  no secrets in the deployed Worker.
- Every response carries security headers (HSTS, nosniff, frame denial, a strict referrer and
  permissions policy); HTML pages also get a Content Security Policy that allows only the site's
  own scripts, Google Fonts and Google's favicon service. See `src/server/security.ts` and the
  `_headers` rules written by `scripts/prepare.cjs`.
- The API (`/api/gateways`) answers GET requests with public data only. Query values are length
  capped and results are capped at 500 per page. Rate limiting is left to Cloudflare (add a rate
  limiting rule for `/api/*` in the zone if traffic warrants it).
- Screenshots were taken with a test account. Names, personal emails, phone numbers and account
  names are partly pixelated (`scripts/mask-personal.cjs`) before publishing, and the same masking
  is applied to published text. OAuth parameters in published URLs (tokens, state, codes) are
  replaced with `…`.
- The local feedback box and its write endpoint exist only under `npm run dev` (a Vite dev
  middleware); production builds contain neither.

## The test OAuth client

Captures use a public OAuth client named "MCP Consents" registered through dynamic client
registration with a `localhost` redirect. No token was ever exchanged and nothing was approved on
purpose. If a provider wants its registrations removed, they can be deleted on their side; the
gallery does not depend on them.

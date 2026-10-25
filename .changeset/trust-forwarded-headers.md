---
'@builder.io/qwik-city': patch
---

fix: ignore spoofable `X-Forwarded-Host`/`X-Forwarded-Proto` headers unless `trustForwardedHeaders` is enabled

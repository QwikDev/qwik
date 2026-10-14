---
'@qwik.dev/core': patch
---

fix: preserve pre-resume interactions on WebKit while HTML streaming stalls.

The default `module` qwikloader strategy now starts the loader from a small inline bootstrap script instead of an external `<script type="module" src>` tag. The bootstrap receives the CSP nonce like other Qwik inline scripts, so nonce-based policies keep working. Deployments that allow inline scripts by hash instead (for example `script-src 'self'` plus a fixed list of `'sha256-...'` hashes) must add a hash for the new bootstrap script, otherwise the browser will block it.

---
'@qwik.dev/core': patch
---

feat: add SSR backpatching (attributes-only) to ensure SSR/CSR parity for signal-driven attributes; opt-in via `SSRBackpatch` and limited to attribute updates (not OoO streaming)

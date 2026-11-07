---
"@qwik.dev/router": patch
---

Handle response stream failures from `send()` so a failed stream or a client disconnect does not produce an unhandled rejection.

---
'@qwik.dev/core': minor
---

feat: add experimental `Reveal` for coordinating `Suspense` boundaries

`Reveal` lets developers coordinate sibling `Suspense` boundaries with `parallel`, `sequential`, `reverse`, or `together` reveal order. Use `collapsed` to hide pending boundaries that are waiting for their turn instead of showing their fallback.


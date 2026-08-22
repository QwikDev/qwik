---
'@qwik.dev/router': patch
---

Route matching now backtracks when a static prefix dead-ends and ranks fully-matching candidates by segment specificity (static < dynamic < catch-all), restoring Qwik 1 semantics where static pages and dynamic route families can share URL prefixes.

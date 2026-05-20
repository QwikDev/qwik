---
'@qwik.dev/core': patch
---

BREAKING (only when using internal v2 beta API): The `_captures` variable is now a singleton object called `_capturesObj` with a single property `_` that contains the captures string. Normally this should not impact you.

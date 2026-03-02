---
'@qwik.dev/core': major
---

BREAKING: (slightly) `-` handling in JSX event handlers has slightly changed. Now, if an event name starts with `-`, the rest of the name will be kept as-is, preserving casing. Otherwise, the event name is made lowercase. Any `-` characters in the middle of the name are preserved as-is. Previously, `-` were considered to mark the next letter as uppercase.
   For example, `onCustomEvent$` will match `customevent`, `on-CustomEvent$` will match `CustomEvent`, and `onCustom-Event$` will match `custom-event`. Before, that last one would match `customEvent` instead.

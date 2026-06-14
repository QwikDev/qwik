---
'@qwik.dev/router': minor
---

Actions now expose the same AsyncSignal surface that loaders already have. The action store gains
a reactive `.loading` boolean (true while a submission is in flight) and a `.promise()` method that
resolves when the in-flight submission settles. `isRunning` is deprecated in favor of `loading` and
kept working as an alias.

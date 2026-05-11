---
'@qwik.dev/core': minor
---

feat: add `waitForVisibleTasks(container)` test helper (exported from `@qwik.dev/core/testing`). Waits for all pending `useVisibleTask$` work to settle, including any renders or follow-up visible tasks they schedule. Useful in tests that need to assert on post-flush side effects without sleeping on magic timeouts. Backed by a new `$visibleTasksPromise$` field on the container that tracks pending visible-task promises without gating `$renderPromise$`.

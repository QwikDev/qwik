---
'@qwik.dev/core': minor
---

FEAT: `useAsync$()` now has `pollMs`, which re-runs the compute function on intervals. You can change signal.pollMs to enable/disable it, and if you set it during SSR it will automatically resume to do the polling.
  This way, you can auto-update data on the client without needing to set up timers or events. For example, you can show a "time ago" string that updates every minute, or you can poll an API for updates, and change the poll interval when the window goes idle.

- FEAT: `useAsync$()` now has a `concurrency` option, which limits the number of concurrent executions of the compute function. If a new execution is triggered while the limit is reached, it will wait for the previous ones to finish before starting. This is useful for preventing overload when the compute function is expensive or when it involves network requests. The default value is 1, which means that a new execution will wait for the previous one to finish before starting. Setting it to 0 allows unlimited concurrent executions.
  In-flight invocations will update the signal value only if they complete before a newer invocation completes. For example, if you have a search input that triggers a new `useAsync$` execution on every keystroke, results will show in the correct order.

- FEAT: `useAsync$()` now has an `abort()` method, which aborts the current computation and runs cleanups if needed. This allows you to cancel long-running tasks when they are no longer needed, such as when a component unmounts or when a new computation starts. The compute function needs to use the `abortSignal` provided to handle aborts gracefully.
  When a new computation starts, the previous computation will be aborted via the abortSignal. This allows you to prevent unnecessary work and ensure that only the latest computation is active. For example, if you have a search input that triggers a new `useAsync$` execution on every keystroke, the previous search will be aborted when a new one starts, ensuring that only the latest search is performed.

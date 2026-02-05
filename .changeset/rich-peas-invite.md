---
'@qwik.dev/core': minor
---

FEAT: `useAsync$()` now has `pollMs`, which re-runs the compute function on intervals. You can change signal.pollMs to enable/disable it, and if you set it during SSR it will automatically resume to do the polling.
This way, you can auto-update data on the client without needing to set up timers or events. For example, you can show a "time ago" string that updates every minute, or you can poll an API for updates, and change the poll interval when the window goes idle.

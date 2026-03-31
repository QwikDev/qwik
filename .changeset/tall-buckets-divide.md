---
'@qwik.dev/core': patch
---

The issue is caused by cli.mjs eagerly loading migrate-v2 code at startup. That migration path has top-level imports of ts-morph, ignore, and semver, so even normal CLI usage in third-party apps can fail with ERR_MODULE_NOT_FOUND when those migrate-only dependencies are not installed.

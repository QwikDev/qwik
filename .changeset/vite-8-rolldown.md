---
'@qwik.dev/core': major
'@qwik.dev/router': major
'@qwik.dev/react': major
---

feat: require Vite 8 and Rolldown. `manualChunks` is no longer supported because Qwik needs Rollup's `outputOpts.manualChunks.onlyExplicitManualChunks` which does not exist in Rolldown's `manualChunks` compatibility API. The qwikVite plugin now relies on Rolldown's equivalent `outputOpts.codeSplitting.includeDependenciesRecursively`. If you used Rollup's `manualChunks`, you need to update your code to Rolldown's `outputOpts.codeSplitting.groups` instead.

---
'@qwik.dev/core': minor
'@qwik.dev/router': patch
---

FEAT: Server output chunk files are now under their own build/ subdir, like the client build. This makes it easier to override the chunk filenames. This is possible because the Router metadata files are now an earlier part of the build process.

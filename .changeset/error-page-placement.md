---
'@qwik.dev/router': patch
---

fix: `error.tsx` renders in place of the folder that failed, so a layout whose middleware or loader threw never renders on its error page

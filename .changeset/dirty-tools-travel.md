---
'@builder.io/qwik-city': patch
---

fix: `zod` is now imported as `import * as z from 'zod'`, which vastly improves bundling. The Insights app client code reduced by 12kB.

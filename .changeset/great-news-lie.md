---
'@qwik.dev/router': minor
'@qwik.dev/core': minor
---

Feat: split Qwik Core and Router dev experience. Core now only adjusts the html using the Vite hook for it, so it can work in any environment or client-only. You can make a Qwik application client-only by running `qwik add csr` now.
Feat: Qwik Route now runs dev mode using the node middleware, which is the same as production, and can now hot-reload when routes are added. It does this by transforming the response while it streams to add the dev scripts. This opens the door for Vite Environment support.
Feat: `qwikVite()` SSR builds now reads the manifest from the client build whenever possible. You can still pass in the manifest yourself if needed.
Fix: Qwik Router's Vite plugin no longer imports Qwik Core, a cause of duplicate imports in dev and preview mode.
Fix: Sometimes, SSG hangs after completion. The cause is still unknown, but now there is a workaround by forcing the process to exit after SSG is done.

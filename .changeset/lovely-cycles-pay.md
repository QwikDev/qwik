---
'@builder.io/qwik-city': patch
---

FIX: Bug #5874 - SSR guard: only throw in true SSR (when window is undefined), allowing actions to run in Vitest tests

How this change works:

Previously the SSR‐guard in `server-functions.ts` unconditionally threw whenever `isServer` was true,  
which blocked invocation of `routeAction$` under Vitest+JSDOM (and the QwikCityMockProvider) in user tests.  

Now we narrow the guard to:
if (isServer && typeof window === 'undefined') {
  throw …;
}

This will ensure:

- True SSR (no window) still throws as before.
- JSDOM/Vitest tests (and browsers) have a global window, skip the throw, and return a Promise.

This change unblocks testing of actions in JSDOM environments without impacting real SSR safety.

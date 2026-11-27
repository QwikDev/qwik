/**
 * The `inlinedQrl` that core's own `$()` sites compile to (see `optimizer-imports.ts`).
 *
 * The core build replaces imports of this module with `@qwik.dev/core`, so the app's optimizer
 * turns each call into a segment with a manifest entry, as it does for any Qwik library.
 */
export { inlinedQrl } from './qrl';

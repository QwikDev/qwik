/**
 * `inlinedQrl` for core's own QRLs (event wrapper, bind handlers, tasks, control flow).
 *
 * The core build replaces imports of this module with `@qwik.dev/core`, so the app's optimizer
 * turns each call into a segment with a manifest entry, as it does for any Qwik library. Import it
 * as `inlinedQrl as _inlinedQrl`: the Rust optimizer matches the imported name, the TS optimizer
 * the local one. Calls need a function declaration, a string-literal name `q_<hash>` that differs
 * from the function's name, and a hash listed in `CORE_QRL_HASHES`; `library-qrl.unit.ts` checks
 * these.
 */
export { inlinedQrl } from './qrl';

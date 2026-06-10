/**
 * Build-time codegen entry for the devtools hook runtimes.
 *
 * Exposes the runtime-string builders so in-repo build steps (e.g. the browser extension) can
 * generate their injected scripts from the single canonical implementation in
 * `./runtime/installers.ts` instead of duplicating the logic.
 *
 * INTERNAL: this is a build-time artifact, deliberately NOT listed in the package `exports` map.
 * Consume it via a relative path inside the monorepo, never as a published `@qwik.dev/devtools`
 * subpath. It is also not part of the browser bundle.
 */
export { createHookRuntime, createExtensionHookRuntime } from './runtime/create-hook-runtime';

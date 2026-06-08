/**
 * Generates `public/devtools-hook.js` from the canonical devtools hook runtime.
 *
 * The runtime logic lives once in `packages/devtools/plugin/src/runtime/installers.ts`
 * (**qwik_install_hook_runtime**) and is shared by the Vite plugin (SSR middleware) and this
 * extension (content script).
 *
 * Run via `pnpm --filter @devtools/browser-extension generate` (also runs automatically before
 * `build` / `dev`).
 */
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Internal build artifact of @qwik.dev/devtools (not a published subpath), imported
// by relative path. Requires the devtools package to be built first.
const codegenPath = resolve(here, '..', '..', 'devtools', 'dist', 'plugin', 'codegen.mjs');
if (!existsSync(codegenPath)) {
  console.error(
    `[gen-devtools-hook] missing ${codegenPath}\n` +
      'Build the devtools package first (pnpm --filter @qwik.dev/devtools build).'
  );
  process.exit(1);
}

const { createExtensionHookRuntime } = await import(codegenPath);
const outPath = resolve(here, '..', 'public', 'devtools-hook.js');
writeFileSync(outPath, createExtensionHookRuntime());
console.log(`[gen-devtools-hook] wrote ${outPath}`);

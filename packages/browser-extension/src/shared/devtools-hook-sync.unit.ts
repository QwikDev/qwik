import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// Internal build artifact of @qwik.dev/devtools (not a published subpath); requires
// the devtools package to be built before this test runs.
import { createExtensionHookRuntime } from '../../../devtools/dist/plugin/codegen.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const hookPath = resolve(here, '..', '..', 'public', 'devtools-hook.js');

describe('devtools-hook.js', () => {
  it('matches the generated output (run `pnpm generate` if this fails)', () => {
    const committed = readFileSync(hookPath, 'utf8');
    expect(committed).toBe(createExtensionHookRuntime());
  });
});

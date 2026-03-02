import { readFileSync } from 'fs';
import { expect, test } from 'vitest';
import compress from 'brotli/compress.js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Run `pnpm build --qwik --dev` to update
test('preloader script', () => {
  let preLoader: string = '';
  try {
    preLoader = readFileSync(resolve(__dirname, '../../../dist/preloader.mjs'), 'utf-8');
  } catch {
    // ignore, we didn't build yet
  }
  // This is to ensure we are deliberate about changes to preloader.
  expect(preLoader.length).toBeGreaterThan(0);
  /**
   * Note that the source length can be shorter by using strings in variables and using those to
   * dereference objects etc, but that actually results in worse compression
   */
  const compressed = compress(Buffer.from(preLoader), { mode: 1, quality: 11 });
  expect([compressed.length, preLoader.length]).toEqual([1802, 5340]);
});

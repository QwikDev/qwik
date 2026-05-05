import { readFileSync } from 'fs';
import { expect, test } from 'vitest';
import compress from 'brotli/compress.js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { minify } from 'terser';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Run `pnpm build --qwik --dev` to update
test('preloader script', async () => {
  let preLoader: string = '';
  try {
    preLoader = readFileSync(resolve(__dirname, '../../../dist/preloader.mjs'), 'utf-8');
  } catch {
    // ignore, we didn't build yet
  }
  // This is to ensure we are deliberate about changes to preloader.
  expect(preLoader.length).toBeGreaterThan(0);
  // The preloader isn't minified yet because it will be processed by the bundler
  const minified = await minify(preLoader, {
    toplevel: true,
    mangle: true,
  });
  const { code } = minified;
  if (!code) {
    throw new Error('Minification failed');
  }
  /**
   * Note that the source length can be shorter by using strings in variables and using those to
   * dereference objects etc, but that actually results in worse compression
   */
  const compressed = compress(Buffer.from(code), { mode: 1, quality: 11 });
  expect({ brotli: compressed.length, minified: code.length }).toMatchInlineSnapshot(`
    {
      "brotli": 1346,
      "minified": 2889,
    }
  `);
});

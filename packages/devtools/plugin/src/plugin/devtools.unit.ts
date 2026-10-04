import { mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { describe, expect, test } from 'vitest';
import { devtoolsPlugin } from './devtools';

describe('devtools plugin transform', () => {
  test('keeps source maps for files it leaves alone and files it instruments', async () => {
    // Windows tmpdir can be an 8.3 short path, which Vite's resolved ids won't match.
    const root = await realpath(await mkdtemp(join(tmpdir(), 'qwik-devtools-sourcemap-')));
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));
    await writeFile(join(root, 'util.ts'), 'export const double = (value: number) => value * 2;\n');
    await writeFile(
      join(root, 'qwik.ts'),
      'export const component$ = (fn: unknown) => fn;\nexport const useSignal = (value: number) => ({ value });\n'
    );
    await writeFile(
      join(root, 'counter.tsx'),
      [
        "import { component$, useSignal } from './qwik';",
        'export const Counter = component$(() => {',
        '  const count = useSignal(0);',
        '  return count.value;',
        '});',
        '',
      ].join('\n')
    );
    const server = await createServer({
      configFile: false,
      root,
      logLevel: 'silent',
      plugins: [devtoolsPlugin()],
      server: { middlewareMode: true, ws: false },
      optimizeDeps: { noDiscovery: true },
    });

    try {
      for (const file of ['util.ts', 'counter.tsx']) {
        const map = (await server.transformRequest(`/${file}`))?.map;
        expect(map).toMatchObject({ sources: [file] });
        expect(map?.mappings).not.toBe('');
      }
    } finally {
      await server.close();
    }
  });
});

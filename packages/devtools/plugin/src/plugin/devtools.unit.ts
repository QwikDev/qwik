import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, resolveConfig } from 'vite';
import { describe, expect, test } from 'vitest';
import { devtoolsPlugin } from './devtools';
import { qwikDevtools } from './index';

describe('Vite Inspect', () => {
  test('opens the standalone inspector without configuring Vite DevTools', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qwik-devtools-inspect-'));
    try {
      const server = await createServer({
        configFile: false,
        root,
        base: '/docs/',
        logLevel: 'silent',
        plugins: [qwikDevtools()],
        server: { host: '127.0.0.1', port: 0 },
        optimizeDeps: { noDiscovery: true },
      });
      try {
        await server.listen();
        const [url] = server.resolvedUrls!.local;
        const response = await fetch(new URL('.vite-inspect/', url));
        expect(new URL(response.url).pathname).toBe('/docs/__inspect/');
        expect(response.status).toBe(200);
        expect(await response.text()).toContain('<title>Vite Inspect</title>');
      } finally {
        await server.close();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test.each([
    ['a production build', 'build', {}],
    ['explicitly disabled DevTools', 'serve', { devtools: false }],
    ['a LAN-facing server', 'serve', { server: { host: '0.0.0.0' } }],
    ['disabled WebSocket token checks', 'serve', { legacy: { skipWebSocketTokenCheck: true } }],
  ] as const)('does not register Inspect with %s', async (_scenario, command, options) => {
    const config = await resolveConfig(
      { ...options, configFile: false, plugins: [qwikDevtools()] },
      command
    );
    expect(config.plugins.map(({ name }) => name)).not.toContain('vite-plugin-inspect');
  });
});

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

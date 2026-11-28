import { mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { describe, expect, test, vi } from 'vitest';
import { devtoolsPlugin } from './devtools';

describe('devtools plugin transform', () => {
  test('selects the overlay independently for each plugin instance', () => {
    const root = `import { component$ } from '@qwik.dev/core'; export default component$(() => <body></body>);`;
    const transform = (plugin: ReturnType<typeof devtoolsPlugin>) => {
      if (!plugin.transform || typeof plugin.transform !== 'object') {
        throw new Error('DevTools transform is missing');
      }
      return Reflect.apply(plugin.transform.handler, {}, [root, '/app/root.tsx']).code as string;
    };
    const activate = (plugin: ReturnType<typeof devtoolsPlugin>) => {
      const setup = plugin.devtools?.setup;
      if (!setup) {
        throw new Error('DevTools setup is missing');
      }
      Reflect.apply(setup, undefined, [
        {
          views: { hostStatic: vi.fn() },
          docks: { register: vi.fn() },
          commands: { register: vi.fn() },
          viteConfig: { base: '/' },
        },
      ]);
    };

    const auto = devtoolsPlugin();
    const otherAuto = devtoolsPlugin();
    expect(transform(auto)).toContain('QwikDevtools }');
    expect(transform(auto)).toContain('<QwikDevtools />');
    activate(auto);
    expect(transform(auto)).toContain('QwikDevtoolsCollector }');
    expect(transform(auto)).toContain('<QwikDevtoolsCollector />');
    expect(transform(otherAuto)).toContain('QwikDevtools }');

    const overlay = devtoolsPlugin({ mode: 'overlay' });
    activate(overlay);
    expect(transform(overlay)).toContain('QwikDevtools }');
    expect(transform(devtoolsPlugin({ mode: 'dock' }))).toContain('QwikDevtoolsCollector }');
  });

  test.each(['auto', 'dock'] as const)('registers the dock and command in %s mode', (mode) => {
    const plugin = devtoolsPlugin({ mode });
    const setup = plugin.devtools?.setup;
    expect(setup).toBeTypeOf('function');
    if (!setup) {
      throw new Error('DevTools setup is missing');
    }
    const hostStatic = vi.fn();
    const registerDock = vi.fn();
    const activate = vi.fn();
    const registerCommand = vi.fn();
    Reflect.apply(setup, undefined, [
      {
        views: { hostStatic },
        docks: { register: registerDock, activate },
        commands: { register: registerCommand },
        viteConfig: { base: '/docs/' },
      },
    ]);

    expect(hostStatic).toHaveBeenCalledWith('/__qwik_devtools__/', expect.any(String));
    expect(registerDock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'qwik-devtools', type: 'iframe' })
    );
    expect(registerCommand).toHaveBeenCalledOnce();
    expect(registerDock.mock.calls[0][0].icon).toBe('logos:qwik-icon');
    expect(registerCommand.mock.calls[0][0].icon).toBe('logos:qwik-icon');
    registerCommand.mock.calls[0][0].handler();
    expect(activate).toHaveBeenCalledWith('qwik-devtools');
  });

  test('does not register the dock in overlay mode', () => {
    const plugin = devtoolsPlugin({ mode: 'overlay' });
    const register = vi.fn();
    const setup = plugin.devtools?.setup;
    if (!setup) {
      throw new Error('DevTools setup is missing');
    }
    Reflect.apply(setup, undefined, [
      {
        views: { hostStatic: register },
        docks: { register },
        commands: { register },
      },
    ]);
    expect(register).not.toHaveBeenCalled();
  });

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

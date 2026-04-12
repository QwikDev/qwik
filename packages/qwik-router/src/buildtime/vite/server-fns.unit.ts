import { describe, expect, it } from 'vitest';
import type { BuiltLayout, BuiltRoute, BuiltServerPlugin, RoutingContext } from '../types';
import { collectServerFnModuleIds } from './server-fns';

describe('collectServerFnModuleIds', () => {
  it('walks the reachable module graph and collects modules containing serverQrl', async () => {
    const resolvedVirtualId = '\0virtual:qwik-router-server-fns';
    const loads: string[] = [];
    const modules = new Map([
      [
        '/app/routes/index.tsx',
        {
          id: '/app/routes/index.tsx',
          code: 'export default component$(() => null);',
          importedIdResolutions: [
            { id: '/app/shared.ts', external: false },
            { id: '/node_modules/@qwik.dev/core/index.mjs', external: false },
          ],
          dynamicallyImportedIdResolutions: [{ id: '/app/lazy.ts', external: false }],
        },
      ],
      [
        '/app/layout.tsx',
        {
          id: '/app/layout.tsx',
          code: 'export default component$(() => null);',
          importedIdResolutions: [{ id: '/app/shared.ts', external: false }],
          dynamicallyImportedIdResolutions: [],
        },
      ],
      [
        '/app/shared.ts',
        {
          id: '/app/shared.ts',
          code: 'export const shared = true;',
          importedIdResolutions: [
            { id: resolvedVirtualId, external: false },
            { id: 'node:fs', external: true },
          ],
          dynamicallyImportedIdResolutions: [],
        },
      ],
      [
        '/app/lazy.ts',
        {
          id: '/app/lazy.ts',
          code: 'export const fn = serverQrl(() => null);',
          importedIdResolutions: [],
          dynamicallyImportedIdResolutions: [],
        },
      ],
      [
        '/node_modules/@qwik.dev/core/index.mjs',
        {
          id: '/node_modules/@qwik.dev/core/index.mjs',
          code: 'export {};',
          importedIdResolutions: [],
          dynamicallyImportedIdResolutions: [],
        },
      ],
      [
        '/app/plugin.ts',
        {
          id: '/app/plugin.ts',
          code: 'export const pluginFn = serverQrl(() => null);',
          importedIdResolutions: [],
          dynamicallyImportedIdResolutions: [],
        },
      ],
    ]);

    const layout: BuiltLayout = {
      filePath: '/app/layout.tsx',
      dirPath: '/app',
      id: 'layout',
      layoutType: 'nested',
      layoutName: '',
    };
    const route: BuiltRoute = {
      id: 'index',
      filePath: '/app/routes/index.tsx',
      ext: 'tsx',
      pathname: '/',
      layouts: [layout],
      routeName: 'index',
      pattern: /^\/$/,
      paramNames: [],
      segments: [],
    };
    const serverPlugin: BuiltServerPlugin = {
      id: 'plugin',
      filePath: '/app/plugin.ts',
      ext: 'ts',
    };
    const ctx: Pick<RoutingContext, 'entries' | 'layouts' | 'routes' | 'serverPlugins'> = {
      routes: [route],
      layouts: [layout],
      serverPlugins: [serverPlugin],
      entries: [],
    };

    const serverFnModules = await collectServerFnModuleIds(ctx, resolvedVirtualId, async (id) => {
      loads.push(id);
      const moduleInfo = modules.get(id);
      if (!moduleInfo) {
        throw new Error(`Unexpected module load: ${id}`);
      }
      return moduleInfo as any;
    });

    expect(serverFnModules.sort()).toEqual(['/app/lazy.ts', '/app/plugin.ts']);
    expect(loads).toEqual([
      '/app/routes/index.tsx',
      '/app/layout.tsx',
      '/app/plugin.ts',
      '/app/shared.ts',
      '/node_modules/@qwik.dev/core/index.mjs',
      '/app/lazy.ts',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import type { BuiltLayout, BuiltRoute, BuiltServerPlugin } from '../types';
import { collectServerFnModuleIds, type ServerFnRoutingContext } from './server-fns';

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
          importedIds: ['/app/shared.ts', '/node_modules/@qwik.dev/core/index.mjs'],
          dynamicallyImportedIds: ['/app/lazy.ts'],
        },
      ],
      [
        '/app/layout.tsx',
        {
          id: '/app/layout.tsx',
          code: 'export default component$(() => null);',
          importedIds: ['/app/shared.ts'],
          dynamicallyImportedIds: [],
        },
      ],
      [
        '/app/shared.ts',
        {
          id: '/app/shared.ts',
          code: 'export const shared = true;',
          importedIds: [resolvedVirtualId],
          dynamicallyImportedIds: [],
        },
      ],
      [
        '/app/lazy.ts',
        {
          id: '/app/lazy.ts',
          code: 'export const fn = serverQrl(() => null);',
          importedIds: [],
          dynamicallyImportedIds: [],
        },
      ],
      [
        '/node_modules/@qwik.dev/core/index.mjs',
        {
          id: '/node_modules/@qwik.dev/core/index.mjs',
          code: 'export {};',
          importedIds: [],
          dynamicallyImportedIds: [],
        },
      ],
      [
        '/app/plugin.ts',
        {
          id: '/app/plugin.ts',
          code: 'export const pluginFn = serverQrl(() => null);',
          importedIds: [],
          dynamicallyImportedIds: [],
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
    const ctx: ServerFnRoutingContext = {
      routes: [route],
      layouts: [layout],
      serverPlugins: [serverPlugin],
    };

    const pluginContext = {
      resolve: async (id: string) => ({ id, external: false }) as any,
      load: async ({ id }: { id: string }) => {
        loads.push(id);
        const moduleInfo = modules.get(id);
        if (!moduleInfo) {
          throw new Error(`Unexpected module load: ${id}`);
        }
        return moduleInfo as any;
      },
    };

    const serverFnModules = await collectServerFnModuleIds(ctx, resolvedVirtualId, pluginContext);

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

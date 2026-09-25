import { describe, expect, it } from 'vitest';
import type { RoutingContext } from '../types';
import { generateQwikRouterConfig } from './generate-qwik-router-config';

const createContext = (target: 'client' | 'ssr'): RoutingContext =>
  ({
    target,
    opts: { basePathname: '/app/', routesDir: '/app/src/routes', rewriteRoutes: [] },
    routes: [],
    routeTrie: { _files: [], children: new Map() },
    serverPlugins: [],
    layouts: [],
    entries: [],
    serviceWorkers: [
      {
        id: 'sw',
        filePath: '/app/src/routes/service-worker.ts',
        chunkFileName: 'service-worker.js',
      },
    ],
    menus: [],
    diagnostics: [],
    isDirty: false,
  }) as unknown as RoutingContext;

const qwikPlugin = { api: { getOptions: () => ({ srcDir: '/app/src' }) } } as any;

describe('generated router config', () => {
  it('registers itself with the runtime on the server', () => {
    const code = generateQwikRouterConfig(createContext('ssr'), qwikPlugin, true);

    expect(code).toContain(`import { _setRouterConfig } from '@qwik.dev/router';`);
    expect(code).toContain(`export const serviceWorkerUrl = "/app/service-worker.js";`);
    expect(code).toMatch(/const config = \{ routes, serverPlugins, .*importEagerModules \};/);
    expect(code).toContain('_setRouterConfig(config);');
  });

  it('stays a plain lazily loaded chunk on the client', () => {
    const code = generateQwikRouterConfig(createContext('client'), qwikPlugin, false);

    expect(code).not.toContain('_setRouterConfig');
    expect(code).not.toContain('@qwik.dev/router');
    expect(code).toContain('export default config;');
  });
});

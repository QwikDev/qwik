import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addRouteLoaderHash,
  clearRouteLoaderHashes,
  findRouteLoaderSourceFiles,
  invalidateRouterConfigModules,
  isRouterSourceFilePath,
  qwikRouter,
} from './plugin';

describe('qwikRouter plugin', () => {
  describe('defaultLoadersSerializationStrategy', () => {
    it('should set the defaultLoadersSerializationStrategy to "never" when not provided', async () => {
      const plugins = qwikRouter();
      await expect((plugins[0] as any)?.config?.({}, { command: 'build' })).resolves.toMatchObject({
        define: {
          'globalThis.__DEFAULT_LOADERS_SERIALIZATION_STRATEGY__': '"never"',
        },
      });
    });

    it('should set the defaultLoadersSerializationStrategy to "always" when provided', async () => {
      const plugins = qwikRouter({
        defaultLoadersSerializationStrategy: 'always',
      });

      await expect((plugins[0] as any)?.config?.({}, { command: 'build' })).resolves.toMatchObject({
        define: {
          'globalThis.__DEFAULT_LOADERS_SERIALIZATION_STRATEGY__': '"always"',
        },
      });
    });
  });

  describe('route loader re-exports', () => {
    it('discovers re-exported source files through the resolver', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'qwik-router-'));
      try {
        const routeDir = join(dir, 'src/routes/[id]');
        const loadersDir = join(dir, 'src/loaders');
        await mkdir(routeDir, { recursive: true });
        await mkdir(loadersDir, { recursive: true });

        const layout = join(routeDir, 'layout.tsx');
        const barrel = join(loadersDir, 'barrel.ts');
        const data = join(loadersDir, 'data.ts');
        await writeFile(layout, `export { useDadJoke } from '~/loaders/barrel';`);
        await writeFile(barrel, `export { useDadJoke } from './data';`);
        await writeFile(data, `export const useDadJoke = 1;`);

        const ctx = {
          routeTrie: {
            _files: [
              {
                type: 'layout',
                extlessName: 'layout',
                ext: '.tsx',
                dirPath: routeDir,
                dirName: '[id]',
                filePath: layout,
                fileName: 'layout.tsx',
              },
            ],
            children: new Map(),
          },
          serverPlugins: [],
        } as any;

        const sources = await findRouteLoaderSourceFiles(ctx, async (specifier, importer) => {
          if (specifier.startsWith('~/')) {
            return join(dir, 'src', specifier.slice(2)) + '.ts';
          }
          if (specifier.startsWith('.')) {
            return join(dirname(importer), specifier) + '.ts';
          }
        });

        expect(sources.get(layout)).toEqual([
          barrel.replaceAll(/\\/g, '/'),
          data.replaceAll(/\\/g, '/'),
        ]);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe('config hook', () => {
    it('should include ssr config for legacy vite build --ssr compatibility', async () => {
      const plugins = qwikRouter();
      const config = await (plugins[0] as any)?.config?.({}, { command: 'build' });
      expect(config.ssr.noExternal).toContain('@qwik.dev/router');
      expect(config.ssr.noExternal).toContain('zod');
      expect(config.ssr.external).toContain('node:async_hooks');
    });
  });

  describe('configEnvironment', () => {
    it('should set noExternal and external for server environments', () => {
      const plugins = qwikRouter();
      const hook = (plugins[0] as any).configEnvironment;
      expect(hook).toBeTypeOf('function');

      const result = hook('ssr', { consumer: 'server' }, { command: 'serve', mode: 'development' });
      expect(result.resolve.noExternal).toContain('@qwik.dev/router');
      expect(result.resolve.noExternal).toContain('zod');
      expect(result.resolve.external).toContain('node:async_hooks');
    });

    it('should give an adapter ssg environment the same externalization as ssr', () => {
      const plugins = qwikRouter();
      const hook = (plugins[0] as any).configEnvironment;

      const result = hook('ssg', { consumer: 'server' }, { command: 'build', mode: 'production' });
      expect(result.resolve.noExternal).toContain('@qwik.dev/router');
      expect(result.resolve.noExternal).toContain('zod');
      expect(result.resolve.external).toContain('node:async_hooks');
    });

    it('should return empty config for client environments', () => {
      const plugins = qwikRouter();
      const hook = (plugins[0] as any).configEnvironment;

      const result = hook(
        'client',
        { consumer: 'client' },
        { command: 'serve', mode: 'development' }
      );
      expect(result).toEqual({});
    });
  });

  describe('routeLoader$ dev cache', () => {
    it('dedupes hashes and can replace stale file entries', () => {
      const loadersByFile = new Map<string, string[]>();

      expect(addRouteLoaderHash(loadersByFile, '/app/src/routes/index.tsx', 'aaa')).toBe(true);
      expect(addRouteLoaderHash(loadersByFile, '/app/src/routes/index.tsx', 'aaa')).toBe(false);
      expect(addRouteLoaderHash(loadersByFile, '/app/src/routes/index.tsx', 'bbb')).toBe(true);
      expect(loadersByFile.get('/app/src/routes/index.tsx')).toEqual(['aaa', 'bbb']);

      expect(clearRouteLoaderHashes(loadersByFile, '/app/src/routes/index.tsx')).toBe(true);
      expect(addRouteLoaderHash(loadersByFile, '/app/src/routes/index.tsx', 'ccc')).toBe(true);
      expect(loadersByFile.get('/app/src/routes/index.tsx')).toEqual(['ccc']);
    });

    it('recognizes all router source files that can affect the route config', () => {
      expect(isRouterSourceFilePath('/app/src/routes/index.tsx')).toBe(true);
      expect(isRouterSourceFilePath('/app/src/routes/index!.tsx')).toBe(true);
      expect(isRouterSourceFilePath('/app/src/routes/index@admin.tsx')).toBe(true);
      expect(isRouterSourceFilePath('/app/src/routes/404.tsx')).toBe(true);
      expect(isRouterSourceFilePath('/app/src/routes/error.tsx')).toBe(true);
      expect(isRouterSourceFilePath('/app/src/routes/layout-main.tsx')).toBe(true);
      expect(isRouterSourceFilePath('/app/src/routes/layout!.tsx')).toBe(true);
      expect(isRouterSourceFilePath('/app/src/routes/menu.md')).toBe(true);
      expect(isRouterSourceFilePath('/app/src/routes/plugin@auth.ts')).toBe(true);

      expect(isRouterSourceFilePath('/app/src/routes/plugin.unit.ts')).toBe(false);
      expect(isRouterSourceFilePath('/app/src/routes/component.tsx')).toBe(false);
    });

    it('invalidates router config modules in all dev module graphs', () => {
      const createGraph = () => {
        const mod = { id: '@qwik-router-config' };
        return {
          mod,
          invalidated: [] as any[],
          getModuleById: (id: string) => (id === '@qwik-router-config' ? mod : undefined),
          invalidateModule(module: any) {
            this.invalidated.push(module);
          },
        };
      };
      const mainGraph = createGraph();
      const clientGraph = createGraph();
      const ssrGraph = createGraph();
      const server = {
        moduleGraph: mainGraph,
        environments: {
          client: { moduleGraph: clientGraph },
          ssr: { moduleGraph: ssrGraph },
        },
      } as any;

      const modules = invalidateRouterConfigModules(server);

      expect(modules).toEqual([mainGraph.mod, clientGraph.mod, ssrGraph.mod]);
      expect(mainGraph.invalidated).toEqual([mainGraph.mod]);
      expect(clientGraph.invalidated).toEqual([clientGraph.mod]);
      expect(ssrGraph.invalidated).toEqual([ssrGraph.mod]);
    });
  });
});

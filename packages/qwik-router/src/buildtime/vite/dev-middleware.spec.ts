import { describe, it, expect, vi } from 'vitest';
import type { ViteDevServer } from 'vite';
import {
  buildRouterCssTags,
  getDevMiddlewareRequestPath,
  getRouterIndexTags,
} from './dev-middleware';

describe('getDevMiddlewareRequestPath', () => {
  it('keeps the base prefix from originalUrl', () => {
    expect(
      getDevMiddlewareRequestPath({
        originalUrl: '/admin/blog/q-loader-abc.dev.json',
        url: '/blog/q-loader-abc.dev.json',
      } as any)
    ).toBe('/admin/blog/q-loader-abc.dev.json');
  });
});

describe('buildRouterCssTags', () => {
  it('inlines a <style> that seeds Vite dedup, plus a module import for native HMR', () => {
    const tags = buildRouterCssTags([
      {
        id: '/app/src/routes/docs/docs.css',
        url: '/src/routes/docs/docs.css',
        css: '.a{color:red}',
      },
    ]);
    expect(tags).toEqual([
      {
        tag: 'style',
        attrs: { 'data-vite-dev-id': '/app/src/routes/docs/docs.css' },
        children: '.a{color:red}',
        injectTo: 'head',
      },
      {
        tag: 'script',
        attrs: { type: 'module' },
        children: 'import "/src/routes/docs/docs.css"',
        injectTo: 'head',
      },
    ]);
  });

  it('falls back to a <link> when the CSS could not be inlined', () => {
    const tags = buildRouterCssTags([
      { id: '/app/src/routes/docs/docs.css', url: '/src/routes/docs/docs.css', css: '' },
    ]);
    expect(tags[0]).toEqual({
      tag: 'link',
      attrs: { rel: 'stylesheet', href: '/src/routes/docs/docs.css' },
      injectTo: 'head',
    });
    // Still imports the module so Vite tracks + HMRs it.
    expect(tags[1]).toMatchObject({ tag: 'script', attrs: { type: 'module' } });
  });

  it('emits one style + one script per CSS module', () => {
    const tags = buildRouterCssTags([
      { id: '/a.css', url: '/a.css', css: '.a{}' },
      { id: '/b.css', url: '/b.css', css: '.b{}' },
    ]);
    expect(tags.filter((t) => t.tag === 'style')).toHaveLength(2);
    expect(tags.filter((t) => t.tag === 'script')).toHaveLength(2);
  });
});

describe('getRouterIndexTags', () => {
  it('prefixes CSS URLs with the Vite base', async () => {
    const cssModule = {
      id: '/app/src/routes/admin.css',
      url: '/@fs/app/src/routes/admin.css',
      file: '/app/src/routes/admin.css',
      importers: new Set(),
    };
    const moduleGraph = { idToModuleMap: new Map([[cssModule.url, cssModule]]) };
    const server = {
      config: { base: '/admin/' },
      environments: {
        client: { moduleGraph: { idToModuleMap: new Map() } },
        ssr: { moduleGraph },
      },
      watcher: { add: vi.fn() },
    } as unknown as ViteDevServer;

    const tags = await getRouterIndexTags(server);
    expect(tags[0]).toEqual({
      tag: 'link',
      attrs: { rel: 'stylesheet', href: '/admin/@fs/app/src/routes/admin.css' },
      injectTo: 'head',
    });
    expect(tags[1]).toMatchObject({
      tag: 'script',
      children: 'import "/admin/@fs/app/src/routes/admin.css"',
    });
  });
});

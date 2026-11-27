import fs from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, assert, test, vi } from 'vitest';
import { parseDirName, walkRoutes } from './walk-routes-dir';
import { updateRoutingContext } from '../build';
import { createBuildContext } from '../context';
import { createRoutes } from '../runtime-generation/generate-routes';
import { loadRoute } from '../../runtime/src/routing';
import type { RouteData } from '../../runtime/src/types';
import type { RewriteRouteOption } from '../types';

afterEach(() => {
  vi.restoreAllMocks();
});

test('route files are ordered by name, not by readdir or stat completion order', async () => {
  const unsortedNames = ['layout.tsx', 'index.tsx', '404.tsx'];
  // Stat completion order differs from readdir order too, so neither can leak into the trie.
  const statDelayMs: Record<string, number> = { 'layout.tsx': 20, 'index.tsx': 1, '404.tsx': 40 };

  vi.spyOn(fs.promises, 'readdir').mockResolvedValue(unsortedNames as any);
  vi.spyOn(fs.promises, 'stat').mockImplementation(async (itemPath) => {
    const name = String(itemPath).split('/').pop()!;
    await new Promise((resolve) => setTimeout(resolve, statDelayMs[name]));
    return { isDirectory: () => false } as fs.Stats;
  });

  const root = await walkRoutes('/app/src/routes');

  assert.deepEqual(
    root._files.map((file) => file.fileName),
    ['404.tsx', 'index.tsx', 'layout.tsx']
  );
});

test('param directory names may contain dashes', () => {
  assert.deepEqual(parseDirName('[user-id]'), {
    key: '_W',
    paramName: 'user-id',
    prefix: undefined,
    suffix: undefined,
  });
  assert.deepEqual(parseDirName('pre[user-id]post'), {
    key: '_W',
    paramName: 'user-id',
    prefix: 'pre',
    suffix: 'post',
  });
  assert.deepEqual(parseDirName('[...rest-path]'), { key: '_A', paramName: 'rest-path' });
});

async function buildSiblingRoutes(names: string[], rewriteRoutes?: RewriteRouteOption[]) {
  const routesDir = '/app/src/routes';
  vi.spyOn(fs.promises, 'readdir').mockImplementation(async (dirPath) => {
    return (String(dirPath) === routesDir ? names : ['index.tsx']) as any;
  });
  vi.spyOn(fs.promises, 'stat').mockImplementation(async (filePath) => {
    return { isDirectory: () => !String(filePath).endsWith('.tsx') } as fs.Stats;
  });
  const ctx = createBuildContext('/app', '/', { rewriteRoutes });
  await updateRoutingContext(ctx);
  const code: string[] = [];
  createRoutes(ctx, { api: { getManifest: () => null } } as any, code, [], true, new Map());
  const expression = code.find((line) => line.startsWith('export const routes ='))!;
  const modules = Object.fromEntries(
    ctx.routes.map((route) => [route.id, { default: route.pathname }])
  );
  return runInNewContext(
    expression.replace('export const routes =', 'const routes =') + '\nroutes;',
    modules
  ) as RouteData;
}

function getMockPage(module: unknown) {
  return (module as { default: string }).default;
}

test('sibling product pages and their suffix routes resolve independently', async () => {
  const routes = await buildSiblingRoutes(['[product]', '[product]-reviews', '[product]-specs']);
  const resolved = await Promise.all(
    ['/camera/', '/camera-reviews/', '/camera-specs/'].map(async (pathname) => {
      const route = await loadRoute(routes, false, pathname);
      return { page: getMockPage(route.$mods$[0]), params: route.$params$ };
    })
  );
  assert.deepEqual(resolved, [
    { page: '/[product]/', params: { product: 'camera' } },
    { page: '/[product]-reviews/', params: { product: 'camera' } },
    { page: '/[product]-specs/', params: { product: 'camera' } },
  ]);
});

test('prefix and suffix routes beat bare parameters and capture only the middle', async () => {
  const routes = await buildSiblingRoutes([
    '[product]',
    'buy-[product]',
    '[product]-reviews',
    'buy-[product]-reviews',
    'buy-camera-reviews',
  ]);
  for (const [pathname, page, product] of [
    ['/camera/', '/[product]/', 'camera'],
    ['/buy-camera/', '/buy-[product]/', 'camera'],
    ['/camera-reviews/', '/[product]-reviews/', 'camera'],
    ['/BUY-Camera-REVIEWS/', '/buy-camera-reviews/', undefined],
    ['/buy-lens-reviews/', '/buy-[product]-reviews/', 'lens'],
    ['/BUY-Lens-REVIEWS/', '/buy-[product]-reviews/', 'Lens'],
    ['/buy-cam%20era-reviews/', '/buy-[product]-reviews/', 'cam era'],
    ['/buy-/', '/[product]/', 'buy-'],
  ] as const) {
    const route = await loadRoute(routes, false, pathname);
    assert.equal(getMockPage(route.$mods$[0]), page, pathname);
    assert.deepEqual(route.$params$, product ? { product } : {}, pathname);
  }
});

test('rewrites keep sibling parameter routes distinct', async () => {
  const routes = await buildSiblingRoutes(
    ['[product]', '[product]-reviews', '[product]-specs'],
    [{ prefix: 'shop', paths: {} }]
  );
  for (const suffix of ['', '-reviews', '-specs']) {
    const route = await loadRoute(routes, false, `/shop/camera${suffix}/`);
    assert.equal(getMockPage(route.$mods$[0]), `/[product]${suffix}/`);
    assert.deepEqual(route.$params$, { product: 'camera' });
  }
});

test('a single suffix route retains its rewrite target', async () => {
  const routes = await buildSiblingRoutes(['[product]-reviews'], [{ prefix: 'shop', paths: {} }]);
  const route = await loadRoute(routes, false, '/shop/camera-reviews/');
  assert.equal(getMockPage(route.$mods$[0]), '/[product]-reviews/');
  assert.deepEqual(route.$params$, { product: 'camera' });
});

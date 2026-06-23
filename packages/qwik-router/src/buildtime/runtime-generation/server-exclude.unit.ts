import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert, beforeAll, describe, test } from 'vitest';
import type { BuiltRoute, RoutingContext } from '../types';
import { getServerExcludedRoutes, isServerFreeSource } from './server-exclude';

describe('server-exclude: isServerFreeSource', () => {
  test('a plain component module is server-free', () => {
    assert.isTrue(isServerFreeSource(`export default () => null;\nexport const head = {};`));
  });

  test('onGet alone stays server-free (GET is served from the static asset)', () => {
    assert.isTrue(isServerFreeSource(`export const onGet = () => {};\nexport default () => null;`));
  });

  test('a non-GET handler export is not server-free', () => {
    assert.isFalse(
      isServerFreeSource(`export const onPost = () => {};\nexport default () => null;`)
    );
    assert.isFalse(isServerFreeSource(`export const onRequest = () => {};`));
  });

  test('importing routeLoader$/routeAction$/globalAction$ is not server-free', () => {
    assert.isFalse(
      isServerFreeSource(
        `import { routeLoader$ } from '@qwik.dev/router';\nexport const useX = routeLoader$(() => 1);`
      )
    );
    assert.isFalse(
      isServerFreeSource(
        `import { globalAction$ } from '@qwik.dev/router';\nexport const useA = globalAction$(() => ({}));`
      )
    );
  });

  test('importing server$ is not server-free (it POSTs to the route URL)', () => {
    assert.isFalse(
      isServerFreeSource(
        `import { server$ } from '@qwik.dev/router';\nexport const getData = server$(() => 1);`
      )
    );
  });

  test('a re-export is treated conservatively (might surface a loader elsewhere)', () => {
    assert.isFalse(
      isServerFreeSource(`export { useX } from './loaders';\nexport default () => null;`)
    );
    assert.isFalse(isServerFreeSource(`export * from './shared';`));
    // A re-export of a router server symbol is caught by the same fail-safe.
    assert.isFalse(
      isServerFreeSource(
        `export { routeLoader$ } from '@qwik.dev/router';\nexport default () => null;`
      )
    );
  });

  test('routeLoader$ appearing only as an unrelated local name is still server-free', () => {
    // No import of the router symbol, so a same-named local cannot be a route loader.
    assert.isTrue(isServerFreeSource(`const routeLoader = 1;\nexport default () => null;`));
  });
});

describe('server-exclude: getServerExcludedRoutes', () => {
  let dir: string;
  // Routes: a prerendered static content page, a prerendered static page with a loader, a
  // prerendered dynamic page, and a static page outside the SSG set.
  const routeNames = {
    content: 'content/index.mdx',
    withLoader: 'with-loader/index.tsx',
    dynamic: 'blog/[slug]/index.tsx',
    notPrerendered: 'about/index.tsx',
    gatedLayout: 'gated/layout.tsx',
    gatedPage: 'gated/index.tsx',
    notFound: '404.tsx',
    errorPage: 'error.tsx',
  };

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'qwik-server-exclude-'));
    for (const rel of Object.values(routeNames)) {
      await mkdir(join(dir, rel, '..'), { recursive: true });
    }
    await writeFile(join(dir, routeNames.content), `# Hello`);
    await writeFile(
      join(dir, routeNames.withLoader),
      `import { routeLoader$ } from '@qwik.dev/router';\nexport const useX = routeLoader$(() => 1);\nexport default () => null;`
    );
    await writeFile(join(dir, routeNames.dynamic), `export default () => null;`);
    await writeFile(join(dir, routeNames.notPrerendered), `export default () => null;`);
    await writeFile(
      join(dir, routeNames.gatedLayout),
      `export const onRequest = () => {};\nexport default () => null;`
    );
    await writeFile(join(dir, routeNames.gatedPage), `export default () => null;`);
    // Server-free 404/error components — the guard must keep them despite this.
    await writeFile(join(dir, routeNames.notFound), `export default () => null;`);
    await writeFile(join(dir, routeNames.errorPage), `export default () => null;`);
  });

  function ctxWith(routes: Partial<BuiltRoute>[]): RoutingContext {
    return {
      opts: { basePathname: '/' },
      routes: routes.map((r) => ({ paramNames: [], layouts: [], ...r })),
    } as unknown as RoutingContext;
  }

  test('excludes only the prerendered, static, server-free routes', async () => {
    const ctx = ctxWith([
      { filePath: join(dir, routeNames.content), ext: '.mdx', pathname: '/content/' },
      { filePath: join(dir, routeNames.withLoader), ext: '.tsx', pathname: '/with-loader/' },
      {
        filePath: join(dir, routeNames.dynamic),
        ext: '.tsx',
        pathname: '/blog/[slug]/',
        paramNames: ['slug'],
      },
      { filePath: join(dir, routeNames.notPrerendered), ext: '.tsx', pathname: '/about/' },
    ]);

    const excluded = await getServerExcludedRoutes(ctx, {
      include: ['/content/*', '/with-loader/*', '/blog/*'],
    });

    assert.isTrue(
      excluded.has(join(dir, routeNames.content)),
      'content page: prerendered + no server code'
    );
    assert.isFalse(
      excluded.has(join(dir, routeNames.withLoader)),
      'has a routeLoader$ → needs the server'
    );
    assert.isFalse(
      excluded.has(join(dir, routeNames.dynamic)),
      'dynamic routes are never excluded'
    );
    assert.isFalse(
      excluded.has(join(dir, routeNames.notPrerendered)),
      'not in the SSG set → must stay'
    );
  });

  test('keeps a server-free route whose layout has a non-GET handler', async () => {
    const ctx = ctxWith([
      {
        filePath: join(dir, routeNames.gatedPage),
        ext: '.tsx',
        pathname: '/gated/',
        layouts: [{ filePath: join(dir, routeNames.gatedLayout) }] as any,
      },
    ]);
    const excluded = await getServerExcludedRoutes(ctx, { include: ['/gated/*'] });
    assert.isFalse(
      excluded.has(join(dir, routeNames.gatedPage)),
      'layout exports onRequest → the route still needs the server'
    );
  });

  test('never excludes error.tsx/404.tsx handlers (they run on the server)', async () => {
    const ctx = ctxWith([
      { filePath: join(dir, routeNames.notFound), ext: '.tsx', pathname: '/404.html' },
      { filePath: join(dir, routeNames.errorPage), ext: '.tsx', pathname: '/error.html' },
    ]);
    // Broad include so both would match; createRouteTester also always reports 404.html prerendered.
    const excluded = await getServerExcludedRoutes(ctx, { include: ['/*'] });
    assert.isFalse(
      excluded.has(join(dir, routeNames.notFound)),
      '404 handler must stay in the server plan'
    );
    assert.isFalse(
      excluded.has(join(dir, routeNames.errorPage)),
      'error handler must stay in the server plan'
    );
  });

  test('returns an empty set when no SSG include is configured', async () => {
    const ctx = ctxWith([
      { filePath: join(dir, routeNames.content), ext: '.mdx', pathname: '/content/' },
    ]);
    assert.equal((await getServerExcludedRoutes(ctx, undefined)).size, 0);
    assert.equal((await getServerExcludedRoutes(ctx, { include: [] })).size, 0);
  });
});

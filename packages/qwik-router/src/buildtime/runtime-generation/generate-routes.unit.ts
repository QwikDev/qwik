import fs from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { assert, describe, test, vi } from 'vitest';
import { normalizePath } from '../../utils/fs';
import { createBuildContext } from '../context';
import { updateRoutingContext } from '../build';
import { matchRouteTree } from '../../runtime/src/routing';
import { getRouteImports } from '../vite/get-route-imports';
import type { BuildTrieNode, BuiltRoute, RouteSourceFile } from '../types';
import { createRoutes, type RouteLoaderSourceFiles } from './generate-routes';

/** Create a minimal BuildTrieNode */
function makeNode(overrides?: Partial<BuildTrieNode>): BuildTrieNode {
  return {
    _files: [],
    children: new Map(),
    ...overrides,
  };
}

/** Create a route source file */
function makeRouteFile(dirPath: string, name = 'index'): RouteSourceFile {
  return {
    type: 'route',
    extlessName: name,
    ext: '.tsx',
    dirPath,
    dirName: dirPath.split('/').pop()!,
    filePath: `${dirPath}/${name}.tsx`,
    fileName: `${name}.tsx`,
  };
}

/** Create a minimal BuiltRoute entry for ctx.routes */
function makeBuiltRoute(filePath: string): BuiltRoute {
  return {
    id: filePath.replace(/[^a-zA-Z]/g, ''),
    filePath,
    ext: '.tsx',
    pathname: '/',
    routeName: '/',
    pattern: /^\//,
    paramNames: [],
    segments: [],
    layouts: [],
  };
}

/** Minimal mock for QwikVitePlugin */
const mockQwikPlugin = {
  api: {
    getManifest: () => null,
  },
} as any;

/** Extract the `routes = ...` expression from generated code */
function getRoutesExpr(
  trie: BuildTrieNode,
  routes: BuiltRoute[] = [],
  loadersByFile?: Map<string, string[]>,
  extra?: {
    basePathname?: string;
    layouts?: Parameters<typeof createRoutes>[0]['layouts'];
    serverPlugins?: Parameters<typeof createRoutes>[0]['serverPlugins'];
    isSSR?: boolean;
    serverExcludePaths?: ReadonlySet<string>;
    routeLoaderSourceFiles?: RouteLoaderSourceFiles;
  }
): string {
  const c: string[] = [];
  const esmImports: string[] = [];
  const ctx = {
    opts: {
      basePathname: extra?.basePathname ?? '/',
      routesDir: '/routes',
      platform: null!,
      mdx: null!,
      serverPluginsDir: '/routes',
      mdxPlugins: null!,
      rewriteRoutes: null!,
      defaultLoadersSerializationStrategy: 'never',
      strictLoaders: true,
    },
    routeTrie: trie,
    routes,
    layouts: extra?.layouts ?? [],
    serverPlugins: extra?.serverPlugins ?? [],
    dynamicImports: true,
    rootDir: '/',
    entries: [],
    serviceWorkers: [],
    menus: [],
    frontmatter: new Map(),
    diagnostics: [],
    target: 'ssr',
    isDirty: false,
    activeBuild: null,
  } satisfies Parameters<typeof createRoutes>[0];
  createRoutes(
    ctx,
    mockQwikPlugin,
    c,
    esmImports,
    extra?.isSSR ?? false,
    loadersByFile,
    extra?.serverExcludePaths,
    extra?.routeLoaderSourceFiles
  );
  const routesLine = c.find((line) => line.startsWith('export const routes'));
  assert.ok(routesLine, 'should have a routes export');
  return routesLine;
}

describe('generate-routes: empty node pruning', () => {
  test('original segment spelling does not retain an empty directory', () => {
    const root = makeNode();
    root.children.set('unused', makeNode({ _S: 'Unused' }));
    assert.include(getRoutesExpr(root), '= {}');
  });

  test('empty leaf child is pruned from output', () => {
    const root = makeNode();
    root.children.set('emptydir', makeNode());

    const expr = getRoutesExpr(root);
    assert.include(expr, '= {}', 'root should be empty when only child is empty');
    assert.notInclude(expr, 'emptydir', 'empty child should not appear');
  });

  test('empty intermediate node with non-empty grandchild is kept', () => {
    const root = makeNode();
    const middle = makeNode();
    const leaf = makeNode();

    const routeFile = makeRouteFile('/test/docs/guide');
    leaf._files = [routeFile];
    middle.children.set('guide', leaf);
    root.children.set('docs', middle);

    const routes = [makeBuiltRoute(routeFile.filePath)];
    const expr = getRoutesExpr(root, routes);
    assert.include(expr, '"docs"', 'intermediate node with non-empty child should be kept');
    assert.include(expr, '"guide"', 'grandchild should appear');
  });

  test('empty group child is pruned from _M array', () => {
    const root = makeNode();
    root.children.set('(empty-group)', makeNode());

    const expr = getRoutesExpr(root);
    assert.notInclude(expr, '_M', 'empty group should not produce _M');
  });

  test('non-empty group is preserved in _M array', () => {
    const root = makeNode();
    const group = makeNode();

    const routeFile = makeRouteFile('/test/(common)');
    group._files = [routeFile];
    root.children.set('(common)', group);

    const routes = [makeBuiltRoute(routeFile.filePath)];
    const expr = getRoutesExpr(root, routes);
    assert.include(expr, '_M', 'non-empty group should produce _M');
  });
});

describe('generate-routes: underscore-prefixed static segments', () => {
  test('are escaped so they cannot collide with metadata keys', () => {
    const root = makeNode();
    const routeFile = makeRouteFile('/test/_4');
    root.children.set('_4', makeNode({ _files: [routeFile] }));
    const param = makeNode({ _P: 'slug', _files: [makeRouteFile('/test/[slug]')] });
    root.children.set('_W', param);

    const expr = getRoutesExpr(root, [
      makeBuiltRoute(routeFile.filePath),
      makeBuiltRoute('/test/[slug]/index.tsx'),
    ]);
    assert.include(expr, '"__4": {');
    assert.include(expr, '"_W": {');
    assert.notInclude(expr, '"_4": {');
  });

  test('are escaped in base pathname segments and rewrite targets', () => {
    const root = makeNode();
    root.children.set('alias', makeNode({ _G: '_drafts/_W' }));

    const expr = getRoutesExpr(root, [], undefined, { basePathname: '/_app/' });
    assert.include(expr, '{ "__app": ');
    assert.include(expr, '_G: "/__app/__drafts/_W"');
  });
});

describe('generate-routes: loadersByFile propagation', () => {
  test('separates layout and page loader hashes at the same node', () => {
    const root = makeNode();
    const page = makeRouteFile('/test');
    const layout = { ...makeRouteFile('/test', 'layout'), type: 'layout' as const };
    root._files = [page, layout];
    const loadersByFile = new Map([
      [page.filePath, ['page-loader']],
      [layout.filePath, ['layout-loader']],
    ]);

    const expr = getRoutesExpr(root, [makeBuiltRoute(page.filePath)], loadersByFile);

    assert.include(expr, '_R: ["layout-loader"]');
    assert.include(expr, '_D: ["page-loader"]');
  });

  test('loadersByFile emits _D hashes for page nodes in dev mode', () => {
    const root = makeNode();
    const child = makeNode();
    const routeFile = makeRouteFile('/test/dashboard');
    child._files = [routeFile];
    root.children.set('dashboard', child);

    const routes = [makeBuiltRoute(routeFile.filePath)];
    const loadersByFile = new Map([[routeFile.filePath, ['loader-hash-abc']]]);
    const expr = getRoutesExpr(root, routes, loadersByFile);

    assert.include(expr, '_D', 'page loaders should not be inherited by child routes');
    assert.include(expr, 'loader-hash-abc', 'loader hash should appear in the output');
    assert.notInclude(expr, '__LOADERS:', 'should not emit placeholder in dev mode');
  });

  test('loadersByFile emits _D hashes for group page nodes in dev mode', () => {
    const root = makeNode();
    const group = makeNode();
    const routeFile = makeRouteFile('/test/(common)');
    group._files = [routeFile];
    root.children.set('(common)', group);

    const routes = [makeBuiltRoute(routeFile.filePath)];
    const loadersByFile = new Map([[routeFile.filePath, ['group-loader-hash']]]);
    const expr = getRoutesExpr(root, routes, loadersByFile);

    assert.include(expr, 'group-loader-hash', 'group child should emit its loader hash');
  });

  test('loadersByFile emits _D hashes from re-exported source files in dev mode', () => {
    const root = makeNode();
    const child = makeNode();
    const routeFile = makeRouteFile('/test/dashboard');
    const loaderFile = '/test/loaders/dashboard.ts';
    child._files = [routeFile];
    root.children.set('dashboard', child);

    const routes = [makeBuiltRoute(routeFile.filePath)];
    const loadersByFile = new Map([[loaderFile, ['reexported-loader-hash']]]);
    const routeLoaderSourceFiles = new Map([[routeFile.filePath, [loaderFile]]]);
    const expr = getRoutesExpr(root, routes, loadersByFile, { routeLoaderSourceFiles });

    assert.include(expr, 'reexported-loader-hash', 're-exported loader hash should be emitted');
  });

  test('without loadersByFile regular children emit a build placeholder', () => {
    const root = makeNode();
    const child = makeNode();
    const routeFile = makeRouteFile('/test/dashboard');
    child._files = [routeFile];
    root.children.set('dashboard', child);

    const routes = [makeBuiltRoute(routeFile.filePath)];
    const expr = getRoutesExpr(root, routes);

    assert.include(
      expr,
      '__LOADERS:',
      'regular child should emit build placeholder without loadersByFile'
    );
    assert.notInclude(expr, 'loader-hash', 'no concrete hash expected in build mode');
  });

  test('build placeholders include re-exported source files', () => {
    const root = makeNode();
    const child = makeNode();
    const routeFile = makeRouteFile('/test/dashboard');
    const loaderFile = '/test/loaders/dashboard.ts';
    child._files = [routeFile];
    root.children.set('dashboard', child);

    const routes = [makeBuiltRoute(routeFile.filePath)];
    const routeLoaderSourceFiles = new Map([[routeFile.filePath, [loaderFile]]]);
    const expr = getRoutesExpr(root, routes, undefined, { routeLoaderSourceFiles });

    assert.include(
      expr,
      `__LOADERS:${routeFile.filePath}|${loaderFile}__`,
      'build placeholder should include re-exported loader source'
    );
  });
});

describe('generate-routes: serverExcludePaths', () => {
  // root → "static" (a static page) and "blog" → "[slug]" (a dynamic page)
  function build() {
    const root = makeNode();

    const staticNode = makeNode();
    const staticFile = makeRouteFile('/test/static');
    staticNode._files = [staticFile];
    root.children.set('static', staticNode);

    const blogNode = makeNode();
    const slugNode = makeNode();
    const slugFile = makeRouteFile('/test/blog/[slug]');
    slugNode._files = [slugFile];
    blogNode.children.set('[slug]', slugNode);
    root.children.set('blog', blogNode);

    const routes: BuiltRoute[] = [
      { ...makeBuiltRoute(staticFile.filePath), pathname: '/static', routeName: '/static' },
      {
        ...makeBuiltRoute(slugFile.filePath),
        pathname: '/blog/[slug]',
        routeName: '/blog/[slug]',
        paramNames: ['slug'],
      },
    ];
    return { root, routes };
  }

  test('omits a route whose file path is in serverExcludePaths', () => {
    const { root, routes } = build();
    const expr = getRoutesExpr(root, routes, undefined, {
      isSSR: true,
      serverExcludePaths: new Set([routes[0].filePath]),
    });
    assert.notInclude(expr, '"static"', 'excluded route should be omitted from the server plan');
    assert.include(expr, '"blog"', 'other routes are unaffected');
  });

  test('keeps every route when serverExcludePaths is empty (SSG full plan, client, dev)', () => {
    const { root, routes } = build();
    const expr = getRoutesExpr(root, routes, undefined, { isSSR: true });
    assert.include(expr, '"static"', 'with no exclusions every route is in the plan');
    assert.include(expr, '"blog"');
  });

  test('prunes an intermediate node once its only leaf is excluded', () => {
    // root → "docs" (no index of its own) → "guide" (its only child), plus a kept "static" leaf.
    const root = makeNode();

    const staticNode = makeNode();
    const staticFile = makeRouteFile('/test/static');
    staticNode._files = [staticFile];
    root.children.set('static', staticNode);

    const docsNode = makeNode();
    const guideNode = makeNode();
    const guideFile = makeRouteFile('/test/docs/guide');
    guideNode._files = [guideFile];
    docsNode.children.set('guide', guideNode);
    root.children.set('docs', docsNode);

    const routes: BuiltRoute[] = [
      { ...makeBuiltRoute(staticFile.filePath), pathname: '/static', routeName: '/static' },
      { ...makeBuiltRoute(guideFile.filePath), pathname: '/docs/guide', routeName: '/docs/guide' },
    ];

    const expr = getRoutesExpr(root, routes, undefined, {
      isSSR: true,
      serverExcludePaths: new Set([guideFile.filePath]),
    });
    assert.notInclude(expr, '"guide"', 'the excluded leaf is omitted');
    assert.notInclude(
      expr,
      '"docs"',
      'the now-empty intermediate node is pruned, not emitted as {}'
    );
    assert.include(expr, '"static"', 'unrelated routes stay in the plan');
  });

  test('keeps a shared intermediate node when a sibling leaf survives exclusion', () => {
    // docs → "a" (excluded) + "b" (kept): the intermediate node must survive via the kept sibling.
    const root = makeNode();
    const docsNode = makeNode();

    const aNode = makeNode();
    const aFile = makeRouteFile('/test/docs/a');
    aNode._files = [aFile];
    docsNode.children.set('a', aNode);

    const bNode = makeNode();
    const bFile = makeRouteFile('/test/docs/b');
    bNode._files = [bFile];
    docsNode.children.set('b', bNode);

    root.children.set('docs', docsNode);

    const routes: BuiltRoute[] = [
      { ...makeBuiltRoute(aFile.filePath), pathname: '/docs/a', routeName: '/docs/a' },
      { ...makeBuiltRoute(bFile.filePath), pathname: '/docs/b', routeName: '/docs/b' },
    ];

    const expr = getRoutesExpr(root, routes, undefined, {
      isSSR: true,
      serverExcludePaths: new Set([aFile.filePath]),
    });
    assert.notInclude(expr, '"a"', 'the excluded leaf is omitted');
    assert.include(expr, '"docs"', 'the intermediate node survives via the kept sibling');
    assert.include(expr, '"b"', 'the kept sibling stays');
  });
});

describe('generate-routes: error/404 boundaries', () => {
  test('error.tsx / 404.tsx emit single _E / _4 loaders', () => {
    const root = makeNode({
      _files: [makeRouteFile('/test', 'error'), makeRouteFile('/test', '404')],
    });
    const routes = [makeBuiltRoute('/test/error.tsx'), makeBuiltRoute('/test/404.tsx')];
    const expr = getRoutesExpr(root, routes);
    assert.include(expr, '_E: ()=>import', '_E is a single loader');
    assert.include(expr, '_4: ()=>import', '_4 is a single loader');
  });

  test('error! / 404! emit override arrays (layout stop)', () => {
    const root = makeNode({
      _files: [makeRouteFile('/test', 'error!'), makeRouteFile('/test', '404!')],
    });
    const routes = [makeBuiltRoute('/test/error!.tsx'), makeBuiltRoute('/test/404!.tsx')];
    const expr = getRoutesExpr(root, routes);
    assert.include(expr, '_E: [ ()=>import', '_E! is an override array');
    assert.include(expr, '_4: [ ()=>import', '_4! is an override array');
  });
});

test('generate-routes: override metadata follows the selected layout chain', () => {
  const page = makeRouteFile('/routes', 'index@custom');
  const defaultLayout = { ...makeRouteFile('/routes', 'layout'), type: 'layout' as const };
  const namedLayout = { ...makeRouteFile('/routes', 'layout-custom'), type: 'layout' as const };
  const root = makeNode({ _files: [defaultLayout, namedLayout, page] });
  const layouts = [defaultLayout, namedLayout].map((layout, i) => ({
    ...layout,
    id: `layout${i}`,
  })) as any;
  const plugins = [{ filePath: '/routes/plugin.ts', id: 'plugin' }] as any;
  const hashes = new Map([
    [defaultLayout.filePath, ['default-hash']],
    [namedLayout.filePath, ['named-hash']],
    [page.filePath, ['page-hash']],
    ['/routes/plugin.ts', ['plugin-hash']],
  ]);
  const expr = getRoutesExpr(
    root,
    [{ ...makeBuiltRoute(page.filePath), layouts: [layouts[1]] }],
    hashes,
    {
      layouts,
      serverPlugins: plugins,
    }
  );
  const regularPage = makeRouteFile('/routes');
  hashes.set(regularPage.filePath, ['regular-hash']);
  const regular = getRoutesExpr(
    makeNode({ _files: [defaultLayout, namedLayout, regularPage] }),
    [makeBuiltRoute(regularPage.filePath)],
    hashes,
    { layouts, serverPlugins: plugins }
  );
  assert.include(regular, '_R: ["default-hash","plugin-hash"]');
  assert.include(regular, '_D: ["regular-hash"]');
  assert.notInclude(regular, 'named-hash');
  assert.include(expr, '_R: ["default-hash","plugin-hash"]');
  assert.include(expr, '_D: ["page-hash","named-hash","plugin-hash"]');
  const production = getRoutesExpr(
    root,
    [{ ...makeBuiltRoute(page.filePath), layouts: [layouts[1]] }],
    undefined,
    {
      layouts,
      serverPlugins: plugins,
    }
  );
  assert.include(
    production,
    '__LOADERS:/routes/index@custom.tsx|/routes/layout-custom.tsx|/routes/plugin.ts__'
  );
});

test.each([
  ['/app/', '/app/target'],
  ['/App/', '/app/target'],
  ['/_A/', '/__a/target'],
])('rewrite targets use lookup keys for the base %s', (basePathname, target) => {
  const trie = makeNode();
  trie.children.set('alias', makeNode({ _G: 'target' }));
  const expr = getRoutesExpr(trie, [], undefined, { basePathname });
  assert.include(expr, `_G: ${JSON.stringify(target)}`);
});

test.each([
  {
    path: 'shop/product/b',
    extraPaths: ['shop/Product/a'],
    url: '/SHOP/product/b/',
    route: 'shop/product/b/',
    names: 1,
    exception: { 1: 'product' },
    paramValue: '',
    neighbors: [['/shop/Product/a/', 'shop/Product/a/']],
  },
  {
    path: 'outer/inner/b',
    extraPaths: ['Outer/Inner/a'],
    url: '/OUTER/INNER/b/',
    route: 'outer/inner/b/',
    names: 2,
    exception: { 0: 'outer', 1: 'inner' },
    paramValue: '',
    neighbors: [['/Outer/Inner/a/', 'Outer/Inner/a/']],
  },
  {
    path: 'product/b',
    extraPaths: ['product/a'],
    url: '/PRODUCT/b/',
    route: 'product/b/',
    names: 0,
    paramValue: '',
    neighbors: [['/product/a/', 'product/a/']],
  },
  {
    path: 'product/b',
    extraPaths: ['Product/a'],
    url: '/product/b/',
    route: 'product/b/',
    names: 1,
    exception: { 0: 'product' },
    paramValue: '',
    neighbors: [['/Product/a/', 'Product/a/']],
  },
  {
    path: 'docs',
    extraPaths: ['product/existing'],
    rewriteOptions: [{ paths: { docs: 'Product' } }],
    url: '/Product/',
    route: 'Product/',
    names: 0,
    exception: { 0: 'Product' },
    paramValue: '',
    neighbors: [['/product/existing/', 'product/existing/']],
  },
  {
    path: 'docs',
    extraPaths: ['Product/existing'],
    rewriteOptions: [{ paths: { docs: 'product' } }],
    url: '/product/',
    route: 'product/',
    names: 1,
    exception: { 0: 'product' },
    paramValue: '',
    neighbors: [['/Product/existing/', 'Product/existing/']],
  },
  {
    path: 'product/[...Slug]',
    extraPaths: ['Product/a'],
    url: '/PRODUCT/Case/Sensitive/',
    route: 'product/[...Slug]/',
    names: 1,
    exception: { 0: 'product' },
    paramValue: 'Case/Sensitive',
    neighbors: [['/Product/a/', 'Product/a/']],
  },
  {
    path: 'product/[ItemId]',
    url: '/PRODUCT/CaseSensitive/',
    route: 'product/[ItemId]/',
    names: 0,
  },
  {
    path: '(Group)/Product/[ItemId]',
    url: '/PRODUCT/CaseSensitive/',
    route: 'Product/[ItemId]/',
    names: 1,
  },
  {
    path: 'Docs/Pre[PageId]Post',
    url: '/DOCS/PRECaseSensitivePOST/',
    route: 'Docs/Pre[PageId]Post/',
    names: 1,
  },
  {
    path: 'Product/[...Slug]',
    url: '/PRODUCT/Case/Sensitive/',
    route: 'Product/[...Slug]/',
    names: 1,
  },
  {
    path: '_Drafts/[ItemId]',
    url: '/_DRAFTS/CaseSensitive/',
    route: '_Drafts/[ItemId]/',
    names: 1,
  },
  {
    path: 'product/[ItemId]',
    base: '/Shop/',
    url: '/sHoP/PRODUCT/CaseSensitive/',
    route: 'Shop/product/[ItemId]/',
    names: 1,
  },
  {
    path: 'product/[ItemId]',
    rewrite: true,
    url: '/it/PRODOTTI/CaseSensitive/',
    route: 'IT/Prodotti/[ItemId]/',
    names: 2,
  },
])(
  'preserves the built route $route when matching $url',
  async ({
    path,
    extraPaths = [],
    base = '/',
    rewrite,
    rewriteOptions,
    url,
    route,
    names,
    exception,
    paramValue,
    neighbors = [],
  }) => {
    const root = await mkdtemp(join(tmpdir(), 'qwik-route-case-'));
    const readDirectory = fs.promises.readdir.bind(fs.promises);
    const readdir = vi.spyOn(fs.promises, 'readdir');
    try {
      const files = [path, ...extraPaths].map((routePath) =>
        normalizePath(join(root, 'src/routes', routePath, 'index.tsx'))
      );
      for (const source of files) {
        await mkdir(dirname(source), { recursive: true });
        await writeFile(source, 'export default () => null;');
      }
      // Preserve case-sensitive directory enumeration on every test filesystem.
      const entries = new Map<string, Set<string>>();
      for (const routePath of [path, ...extraPaths]) {
        let directory = normalizePath(join(root, 'src/routes'));
        for (const segment of [...routePath.split('/'), 'index.tsx']) {
          if (!entries.has(directory)) {
            entries.set(directory, new Set());
          }
          entries.get(directory)!.add(segment);
          directory = normalizePath(join(directory, segment));
        }
      }
      readdir.mockImplementation(async (directory) => {
        const names = entries.get(normalizePath(String(directory)));
        return names ? ([...names] as any) : readDirectory(directory);
      });
      const ctx = createBuildContext(
        root,
        base,
        {
          rewriteRoutes:
            rewriteOptions ??
            (rewrite ? [{ prefix: 'IT', paths: { product: 'Prodotti' } }] : undefined),
        },
        'client'
      );
      await updateRoutingContext(ctx);
      const code: string[] = [];
      createRoutes(ctx, mockQwikPlugin, code, [], false, new Map());
      const expression = code.find((line) => line.startsWith('export const routes'))!;
      // eslint-disable-next-line no-new-func
      const routes = new Function(expression.replace('export const routes =', 'return'))();
      assert.equal((expression.match(/_S:/g) ?? []).length, names);
      assert.equal((expression.match(/_C:/g) ?? []).length, exception ? 1 : 0);
      if (exception) {
        assert.include(expression, `_C: ${JSON.stringify(exception)}`);
      }
      const matched = matchRouteTree(routes, url);
      assert.isFalse(matched.notFound);
      assert.equal(matched.routeParts.join('/') + '/', route);
      assert.equal(
        Object.values(matched.params).join('/'),
        paramValue ?? (path.includes('[...') ? 'Case/Sensitive' : 'CaseSensitive')
      );
      const imports = getRouteImports(ctx.routes, {
        bundles: Object.fromEntries(
          files.map((source, index) => [
            index ? `page-${index}.js` : 'page.js',
            { origins: [source] },
          ])
        ),
      } as any);
      assert.deepEqual(imports[route].dynamicImports, ['page.js']);
      for (const [neighborUrl, neighborRoute] of neighbors) {
        const neighbor = matchRouteTree(routes, neighborUrl);
        assert.isFalse(neighbor.notFound);
        assert.equal(neighbor.routeParts.join('/') + '/', neighborRoute);
        assert.property(imports, neighborRoute);
      }
    } finally {
      readdir.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  }
);

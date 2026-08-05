import { assert, describe, test } from 'vitest';
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
    isSSR?: boolean;
    serverExcludePaths?: ReadonlySet<string>;
    routeLoaderSourceFiles?: RouteLoaderSourceFiles;
  }
): string {
  const c: string[] = [];
  const esmImports: string[] = [];
  const ctx = {
    opts: {
      basePathname: '/',
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
    layouts: [],
    serverPlugins: [],
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

describe('generate-routes: loadersByFile propagation', () => {
  test('loadersByFile emits _R hashes for regular child nodes in dev mode', () => {
    const root = makeNode();
    const child = makeNode();
    const routeFile = makeRouteFile('/test/dashboard');
    child._files = [routeFile];
    root.children.set('dashboard', child);

    const routes = [makeBuiltRoute(routeFile.filePath)];
    const loadersByFile = new Map([[routeFile.filePath, ['loader-hash-abc']]]);
    const expr = getRoutesExpr(root, routes, loadersByFile);

    assert.include(expr, '_R', 'regular child should emit _R when loadersByFile is provided');
    assert.include(expr, 'loader-hash-abc', 'loader hash should appear in the output');
    assert.notInclude(expr, '__LOADERS:', 'should not emit placeholder in dev mode');
  });

  test('loadersByFile emits _R hashes for group child nodes in dev mode', () => {
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

  test('loadersByFile emits _R hashes from re-exported source files in dev mode', () => {
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

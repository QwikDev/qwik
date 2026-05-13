import { assert, describe, test } from 'vitest';
import type { BuildTrieNode, BuiltRoute, RouteSourceFile } from '../types';
import { createRoutes } from './generate-routes';

/** Create a minimal BuildTrieNode */
function makeNode(overrides?: Partial<BuildTrieNode>): BuildTrieNode {
  return {
    _files: [],
    _dirPath: '/test',
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
  loadersByFile?: Map<string, string[]>
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
  createRoutes(ctx, mockQwikPlugin, c, esmImports, false, loadersByFile);
  const routesLine = c.find((line) => line.startsWith('export const routes'));
  assert.ok(routesLine, 'should have a routes export');
  return routesLine;
}

describe('generate-routes: empty node pruning', () => {
  test('empty leaf child is pruned from output', () => {
    const root = makeNode();
    root.children.set('emptydir', makeNode({ _dirPath: '/test/emptydir' }));

    const expr = getRoutesExpr(root);
    assert.include(expr, '= {}', 'root should be empty when only child is empty');
    assert.notInclude(expr, 'emptydir', 'empty child should not appear');
  });

  test('empty intermediate node with non-empty grandchild is kept', () => {
    const root = makeNode();
    const middle = makeNode({ _dirPath: '/test/docs' });
    const leaf = makeNode({ _dirPath: '/test/docs/guide' });

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
    root.children.set('(empty-group)', makeNode({ _dirPath: '/test/(empty-group)' }));

    const expr = getRoutesExpr(root);
    assert.notInclude(expr, '_M', 'empty group should not produce _M');
  });

  test('non-empty group is preserved in _M array', () => {
    const root = makeNode();
    const group = makeNode({ _dirPath: '/test/(common)' });

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
    const child = makeNode({ _dirPath: '/test/dashboard' });
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
    const group = makeNode({ _dirPath: '/test/(common)' });
    const routeFile = makeRouteFile('/test/(common)');
    group._files = [routeFile];
    root.children.set('(common)', group);

    const routes = [makeBuiltRoute(routeFile.filePath)];
    const loadersByFile = new Map([[routeFile.filePath, ['group-loader-hash']]]);
    const expr = getRoutesExpr(root, routes, loadersByFile);

    assert.include(expr, 'group-loader-hash', 'group child should emit its loader hash');
  });

  test('without loadersByFile regular children emit a build placeholder', () => {
    const root = makeNode();
    const child = makeNode({ _dirPath: '/test/dashboard' });
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
});

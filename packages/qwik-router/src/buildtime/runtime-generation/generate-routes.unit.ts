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
function getRoutesExpr(trie: BuildTrieNode, routes: BuiltRoute[] = []): string {
  const c: string[] = [];
  const esmImports: string[] = [];
  const ctx = {
    opts: { basePathname: '/', routesDir: '/routes' },
    routeTrie: trie,
    routes,
    layouts: [],
    dynamicImports: true,
  } as any;
  createRoutes(ctx, mockQwikPlugin, c, esmImports, false);
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

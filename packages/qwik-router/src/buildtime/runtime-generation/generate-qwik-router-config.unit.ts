import { assert, describe, test } from 'vitest';
import type { BuildTrieNode } from '../types';
import { generateQwikRouterConfig } from './generate-qwik-router-config';

const mockQwikPlugin = { api: { getManifest: () => null } } as any;

/** Minimal empty routing context — enough for the config generator to run with no routes. */
function emptyCtx() {
  const routeTrie: BuildTrieNode = { _files: [], children: new Map() };
  return {
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
    routeTrie,
    routes: [],
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
  } satisfies Parameters<typeof generateQwikRouterConfig>[0];
}

const SERVER_FNS_IMPORT = `import 'virtual:qwik-router-server-fns';`;

describe('generateQwikRouterConfig: server$ registry', () => {
  test('the deployed SSR build imports the server$ registry (RPC dispatch needs it)', () => {
    const code = generateQwikRouterConfig(emptyCtx(), mockQwikPlugin, true, false);
    assert.include(code, SERVER_FNS_IMPORT);
  });

  test('the SSG build omits the registry (prerender never dispatches RPC)', () => {
    const code = generateQwikRouterConfig(emptyCtx(), mockQwikPlugin, true, true);
    assert.notInclude(code, SERVER_FNS_IMPORT);
  });

  test('the client build omits the registry', () => {
    const code = generateQwikRouterConfig(emptyCtx(), mockQwikPlugin, false, false);
    assert.notInclude(code, SERVER_FNS_IMPORT);
  });
});

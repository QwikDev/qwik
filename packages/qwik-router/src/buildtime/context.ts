import { isAbsolute, resolve } from 'node:path';
import { normalizePath } from '../utils/fs';
import type { RoutingContext, NormalizedPluginOptions, PluginOptions } from './types';

export function createBuildContext(
  rootDir: string,
  viteBasePath: string,
  userOpts?: PluginOptions,
  target?: 'ssr' | 'client',
  dynamicImports?: boolean
) {
  const ctx: RoutingContext = {
    rootDir: normalizePath(rootDir),
    opts: normalizeOptions(rootDir, viteBasePath, userOpts),
    routes: [],
    serverPlugins: [],
    layouts: [],
    entries: [],
    serviceWorkers: [],
    menus: [],
    diagnostics: [],
    frontmatter: new Map(),
    target: target || 'ssr',
    dynamicImports: target === 'client' || !!dynamicImports,
    isDirty: true,
    activeBuild: null,
  };
  return ctx;
}

export function resetBuildContext(ctx: RoutingContext | null) {
  if (ctx) {
    ctx.routes.length = 0;
    ctx.layouts.length = 0;
    ctx.entries.length = 0;
    ctx.menus.length = 0;
    ctx.diagnostics.length = 0;
    ctx.frontmatter.clear();
    ctx.isDirty = true;
  }
}

function normalizeOptions(
  rootDir: string,
  viteBasePath: string,
  userOpts: PluginOptions | undefined
) {
  if (!(viteBasePath.startsWith('/') && viteBasePath.endsWith('/'))) {
    // TODO v2: make this an error
    console.error(
      `warning: vite's config.base must begin and end with /. This will be an error in v2. If you have a valid use case, please open an issue.`
    );
    if (!viteBasePath.endsWith('/')) {
      viteBasePath += '/';
    }
  }
  const opts: NormalizedPluginOptions = { ...userOpts } as any;

  if (typeof opts.routesDir !== 'string') {
    opts.routesDir = resolve(rootDir, 'src', 'routes');
  } else if (!isAbsolute(opts.routesDir)) {
    opts.routesDir = resolve(rootDir, opts.routesDir);
  }
  opts.routesDir = normalizePath(opts.routesDir);

  if (typeof opts.serverPluginsDir !== 'string') {
    opts.serverPluginsDir = opts.routesDir;
  } else if (!isAbsolute(opts.serverPluginsDir)) {
    opts.serverPluginsDir = resolve(rootDir, opts.serverPluginsDir);
  }
  opts.serverPluginsDir = normalizePath(opts.serverPluginsDir);

  if (typeof (opts as any).baseUrl === 'string') {
    // baseUrl deprecated
    opts.basePathname = (opts as any).baseUrl;
  }

  if (typeof opts.basePathname !== 'string') {
    // opts.basePathname is used internally
    // but in most cases should be passed in by the vite config "base" property
    opts.basePathname = viteBasePath;
  }
  if (!opts.basePathname.endsWith('/')) {
    // TODO: in v2 make this an error
    console.error(
      `Warning: qwik-router plugin basePathname must end with /. This will be an error in v2`
    );
    opts.basePathname += '/';
  }

  // cleanup basePathname
  const url = new URL(opts.basePathname, 'https://qwik.dev/');
  opts.basePathname = url.pathname;

  opts.mdx = opts.mdx || {};
  opts.platform = opts.platform || {};

  return opts;
}

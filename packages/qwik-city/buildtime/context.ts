import type {
  NormalizedPluginOptions,
  BuildContext,
  PluginOptions,
  StructureOptions,
} from './types';
import { isAbsolute, resolve } from 'node:path';
import { normalizePath } from '../utils/fs';

export function createBuildContext(
  rootDir: string,
  userOpts?: PluginOptions,
  target?: 'ssr' | 'client'
) {
  const ctx: BuildContext = {
    rootDir: normalizePath(rootDir),
    opts: normalizeOptions(rootDir, userOpts),
    routes: [],
    serverPlugins: [],
    layouts: [],
    entries: [],
    serviceWorkers: [],
    menus: [],
    diagnostics: [],
    frontmatter: new Map(),
    target: target || 'ssr',
    isDevServer: false,
    isDevServerClientOnly: false,
    isDirty: true,
    activeBuild: null,
  };
  return ctx;
}

export function resetBuildContext(ctx: BuildContext | null) {
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

function normalizeOptions(rootDir: string, userOpts: PluginOptions | undefined) {
  // TODO: maybe employ a merge-strategy here instead of all the checks?

  const opts: NormalizedPluginOptions = { ...userOpts } as any;
  const defaultStructureOptions: Required<StructureOptions> = {
    layoutNameMarker: '@',
  };

  if (typeof opts.routesDir !== 'string') {
    opts.routesDir = resolve(rootDir, 'src', 'routes');
  } else if (!isAbsolute(opts.routesDir)) {
    opts.routesDir = resolve(rootDir, opts.routesDir);
  }
  opts.routesDir = normalizePath(opts.routesDir);

  if (typeof opts.serverPluginsDir !== 'string') {
    opts.serverPluginsDir = resolve(rootDir, 'src', 'routes');
  } else if (!isAbsolute(opts.serverPluginsDir)) {
    opts.serverPluginsDir = resolve(rootDir, opts.serverPluginsDir);
  }
  opts.serverPluginsDir = normalizePath(opts.serverPluginsDir);

  if (typeof opts.baseUrl === 'string') {
    // baseUrl deprecated
    opts.basePathname = opts.baseUrl;
  }

  if (typeof opts.basePathname !== 'string') {
    opts.basePathname = '/';
  } else {
    const url = new URL(opts.basePathname, 'https://qwik.builer.io/');
    opts.basePathname = url.pathname;
    if (!opts.basePathname.endsWith('/')) {
      opts.basePathname += '/';
    }
  }

  if (typeof opts.trailingSlash !== 'boolean') {
    opts.trailingSlash = true;
  }

  opts.mdx = opts.mdx || {};

  opts.structure = {
    ...defaultStructureOptions,
    ...opts.structure,
  };

  return opts;
}

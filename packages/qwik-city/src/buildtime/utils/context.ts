import type { NormalizedPluginOptions, BuildContext, PluginOptions } from '../types';
import { isAbsolute, resolve } from 'path';
import { normalizePath } from './fs';

export function createBuildContext(rootDir: string, userOpts?: PluginOptions) {
  const ctx: BuildContext = {
    rootDir: normalizePath(rootDir),
    opts: normalizeOptions(rootDir, userOpts),
    routes: [],
    layouts: [],
    menus: [],
    diagnostics: [],
    ids: new Set(),
  };
  return ctx;
}

export function resetBuildContext(ctx: BuildContext) {
  ctx.routes.length = 0;
  ctx.layouts.length = 0;
  ctx.menus.length = 0;
  ctx.diagnostics.length = 0;
  ctx.ids.clear();
}

function normalizeOptions(rootDir: string, userOpts: PluginOptions | undefined) {
  const opts: NormalizedPluginOptions = { ...userOpts } as any;

  if (typeof opts.routesDir !== 'string') {
    opts.routesDir = resolve(rootDir, 'src', 'routes');
  } else if (!isAbsolute(opts.routesDir)) {
    opts.routesDir = resolve(rootDir, opts.routesDir);
  }
  opts.routesDir = normalizePath(opts.routesDir);

  if (!Array.isArray(opts.dirs)) {
    opts.dirs = [];
  }
  opts.dirs = opts.dirs.reduce((dirs: string[], d) => {
    if (typeof d === 'string') {
      const dir = normalizePath(resolve(rootDir, d));
      if (dir !== opts.routesDir && !dirs.includes(dir)) {
        dirs.push(dir);
      }
    }
    return dirs;
  }, []);

  if (typeof opts.trailingSlash !== 'boolean') {
    opts.trailingSlash = false;
  }

  opts.mdx = opts.mdx || {};

  return opts;
}

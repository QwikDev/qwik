import type { NormalizedPluginOptions, BuildContext, PluginOptions } from '../types';
import { isAbsolute, resolve } from 'path';
import { normalizePath } from './fs';

export function createBuildContext(
  rootDir: string,
  userOpts?: PluginOptions,
  target?: 'ssr' | 'client'
) {
  const ctx: BuildContext = {
    rootDir: normalizePath(rootDir),
    opts: normalizeOptions(rootDir, userOpts),
    routes: [],
    layouts: [],
    menus: [],
    diagnostics: [],
    frontmatter: new Map(),
    ids: new Set(),
    target: target || 'ssr',
    dirty: true,
  };
  return ctx;
}

export function resetBuildContext(ctx: BuildContext | null) {
  if (ctx) {
    ctx.routes.length = 0;
    ctx.layouts.length = 0;
    ctx.menus.length = 0;
    ctx.diagnostics.length = 0;
    ctx.frontmatter.clear();
    ctx.ids.clear();
    ctx.dirty = true;
  }
}

function normalizeOptions(rootDir: string, userOpts: PluginOptions | undefined) {
  const opts: NormalizedPluginOptions = { ...userOpts } as any;

  if (typeof opts.routesDir !== 'string') {
    opts.routesDir = resolve(rootDir, 'src', 'routes');
  } else if (!isAbsolute(opts.routesDir)) {
    opts.routesDir = resolve(rootDir, opts.routesDir);
  }
  opts.routesDir = normalizePath(opts.routesDir);

  if (typeof opts.trailingSlash !== 'boolean') {
    opts.trailingSlash = false;
  }

  opts.mdx = opts.mdx || {};

  return opts;
}

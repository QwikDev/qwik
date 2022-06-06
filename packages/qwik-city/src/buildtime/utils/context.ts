import type { NormalizedPluginOptions, BuildContext, PluginOptions } from '../types';
import { isAbsolute, resolve } from 'path';
import { normalizePath } from './fs';

export function createBuildContext(
  rootDir: string,
  opts: NormalizedPluginOptions,
  warn: (msg: string) => void
) {
  const ctx: BuildContext = {
    rootDir: normalizePath(rootDir),
    opts,
    pages: [],
    layouts: [],
    indexes: [],
    log: {
      warn,
    },
  };
  return ctx;
}

export function normalizeOptions(rootDir: string, userOpts: PluginOptions) {
  const opts: NormalizedPluginOptions = { ...userOpts } as any;

  if (typeof opts.pagesDir !== 'string') {
    opts.pagesDir = resolve(rootDir, 'src', 'pages');
  } else if (!isAbsolute(opts.pagesDir)) {
    opts.pagesDir = resolve(rootDir, opts.pagesDir);
  }
  opts.pagesDir = normalizePath(opts.pagesDir);

  if (typeof opts.trailingSlash !== 'boolean') {
    opts.trailingSlash = false;
  }

  return opts;
}

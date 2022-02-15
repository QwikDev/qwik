import { extname, basename, relative, dirname } from 'path';
import type { NormalizedPluginOptions, PageAttributes, ParsedPage } from './types';
import frontmatter from 'front-matter';
import slugify from 'slugify';
import { PluginOptions } from '.';

export function parseFile(opts: NormalizedPluginOptions, filePath: string, content: string) {
  const parsed = frontmatter<any>(content);
  if (parsed) {
    return parsePage(opts, filePath, parsed.attributes);
  }
}

function parsePage(opts: NormalizedPluginOptions, filePath: string, attrs: PageAttributes) {
  attrs = attrs || {};
  validateLayout(opts, filePath, attrs);
  const page: ParsedPage = {
    pathname: getPagePathname(opts, filePath, attrs),
    title: getPageTitle(filePath, attrs),
    filePath,
  };
  return page;
}

export function getPagePathname(
  opts: NormalizedPluginOptions,
  filePath: string,
  attrs: PageAttributes
) {
  if (typeof attrs.permalink === 'string' && attrs.permalink) {
    const permalink = attrs.permalink!;
    if (!permalink.startsWith('/')) {
      throw new Error(`permalink "${permalink}" must start with a /`);
    }
    const url = new URL(permalink, 'http://normalize.me/');
    return url.pathname;
  }

  let pathname = toPosix(relative(opts.pagesDir, filePath));

  const fileName = getBasename(pathname);
  const dirName = toPosix(dirname(pathname));
  if (fileName === 'index') {
    pathname = dirName;
  } else {
    pathname = `/${dirName}/${fileName}`;
  }

  pathname = pathname
    .trim()
    .toLocaleLowerCase()
    .replace(/ /g, '-')
    .replace(/_/g, '-')
    .split('/')
    .map((p) => slugify(p))
    .join('/');

  const url = new URL(pathname, 'http://normalize.me/');

  return url.pathname
    .split('/')
    .map((p) => slugify(p))
    .join('/');
}

export function getPageTitle(filePath: string, attrs: PageAttributes) {
  let title = '';
  if (typeof attrs.title === 'string') {
    title = attrs.title!.trim();
  }
  if (title === '') {
    title = getBasename(filePath);
    title = toTitleCase(title.replace(/-/g, ' '));
  }
  return title.trim();
}

export function validateLayout(
  opts: NormalizedPluginOptions,
  filePath: string,
  attrs: PageAttributes
) {
  if (opts && opts.layouts != null) {
    if (typeof attrs.layout === 'string' && attrs.layout !== 'default') {
      if (!opts.layouts[attrs.layout as any]) {
        throw new Error(`Invalid layout "${attrs.layout}" in ${filePath}`);
      }
    }
  }
}

function getBasename(filePath: string) {
  if (filePath.endsWith('.md')) {
    return basename(filePath, '.md');
  }
  if (filePath.endsWith('.mdx')) {
    return basename(filePath, '.mdx');
  }
  return basename(filePath);
}

function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, function (txt: string) {
    return txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase();
  });
}

function toPosix(p: string) {
  return p.replace(/\\/g, '/');
}

export function normalizeOptions(userOpts: PluginOptions) {
  userOpts = { ...userOpts };
  const extensions = (Array.isArray(userOpts.extensions) ? userOpts.extensions : ['.md', '.mdx'])
    .filter((ext) => typeof ext === 'string')
    .map((ext) => ext.toLowerCase().trim());
  const opts: NormalizedPluginOptions = { ...userOpts, extensions };
  return opts;
}

export function isMarkdownFile(opts: NormalizedPluginOptions, filePath: string) {
  if (typeof filePath === 'string') {
    const ext = extname(filePath).toLowerCase();
    return opts.extensions.includes(ext);
  }
  return false;
}

/** Known file extension we know are not directories so we can skip over them */
export const IGNORE_EXT: { [key: string]: boolean } = {
  '.ts': true,
  '.tsx': true,
  '.js': true,
  '.mjs': true,
  '.cjs': true,
  '.jsx': true,
  '.css': true,
  '.html': true,
  '.png': true,
  '.jpg': true,
  '.jpeg': true,
  '.gif': true,
  '.ico': true,
  '.svg': true,
  '.txt': true,
  '.json': true,
  '.yml': true,
  '.yaml': true,
  '.toml': true,
  '.lock': true,
  '.log': true,
  '.bazel': true,
  '.bzl': true,
};

/** Known file and directory names we know we can skip over */
export const IGNORE_NAMES: { [key: string]: boolean } = {
  build: true,
  dist: true,
  node_modules: true,
  target: true,
  'README.md': true,
  README: true,
  LICENSE: true,
  'LICENSE.md': true,
  Dockerfile: true,
  Makefile: true,
  WORKSPACE: true,
  '.devcontainer': true,
  '.gitignore': true,
  '.gitattributese': true,
  '.gitkeep': true,
  '.github': true,
  '.husky': true,
  '.npmrc': true,
  '.nvmrc': true,
  '.prettierignore': true,
  '.history': true,
  '.vscode': true,
  '.DS_Store': true,
};

import { extname, basename, dirname } from 'path';
import type { NormalizedPluginOptions, PageAttributes, ParsedPage } from './types';
import frontmatter from 'front-matter';
import slugify from 'slugify';
import { PluginOptions } from '.';

export function parseFile(opts: NormalizedPluginOptions, filePath: string, content: string) {
  try {
    const parsed = frontmatter<any>(content);
    if (parsed && parsed.attributes) {
      return getPage(opts, filePath, parsed.attributes);
    }
  } catch (e) {
    console.error(filePath, e);
  }
}

function getPage(opts: NormalizedPluginOptions, filePath: string, attrs: PageAttributes) {
  const id = getPageId(filePath, attrs);
  const pathname = getPagePathname(filePath, id, attrs);
  const title = getPageTitle(id, attrs);
  const layout = getPageLayout(opts, attrs);

  delete attrs.id;
  delete attrs.pathname;
  delete attrs.title;
  delete attrs.layout;

  const page: ParsedPage = {
    id,
    pathname,
    title,
    layout,
    filePath,
  };
  return page;
}

function getPageId(filePath: string, attrs: PageAttributes) {
  let id = '';
  if (typeof attrs.id === 'string' && attrs.id) {
    id = attrs.id!;
  } else {
    let fileName = getFileName(filePath);
    if (fileName === 'index') {
      const dir = dirname(filePath);
      fileName = getFileName(dir);
    }
    id = fileName;
  }
  id = slugify(id);
  return id;
}

function getPagePathname(filePath: string, id: string, attrs: PageAttributes) {
  let pathname = '';
  if (typeof attrs.pathname === 'string' && attrs.pathname) {
    pathname = attrs.pathname!;
  } else {
    pathname = id;
  }

  const paths = pathname
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => slugify(p, { lower: true }));

  return '/' + paths.join('/');
}

function getPageTitle(id: string, attrs: PageAttributes) {
  let title = '';
  if (typeof attrs.title === 'string' && attrs.title) {
    title = attrs.title!;
  } else {
    title = toTitleCase(id.replace(/-/g, ' '));
  }
  title = title.trim();
  return title;
}

function getPageLayout(opts: NormalizedPluginOptions, attrs: PageAttributes) {
  let layout = 'default';
  if (opts.layouts[attrs.layout!]) {
    layout = attrs.layout!;
  }
  return layout;
}

function getFileName(filePath: string) {
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
  public: true,
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

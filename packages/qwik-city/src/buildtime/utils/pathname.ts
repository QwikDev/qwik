import { relative, dirname, join } from 'path';
import type { NormalizedPluginOptions } from '../types';
import { getBasename, isMarkdownFile, normalizePath } from './fs';
import slugify from 'slugify';

export function getPagePathname(opts: NormalizedPluginOptions, filePath: string) {
  let pathname = normalizePath(relative(opts.pagesDir, filePath));

  const fileName = getBasename(pathname);
  const dirName = normalizePath(dirname(pathname));
  if (fileName === 'index') {
    if (dirName === '.') {
      return '/';
    }
    pathname = `/${dirName}`;
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

  return normalizePathname(opts, pathname);
}

export function getIndexPathname(opts: NormalizedPluginOptions, filePath: string) {
  let pathname = normalizePath(relative(opts.pagesDir, filePath));
  pathname = `/` + normalizePath(dirname(pathname));
  return normalizePathname(opts, pathname);
}

export function normalizePathname(opts: NormalizedPluginOptions, pathname: string) {
  pathname = pathname
    .trim()
    .toLocaleLowerCase()
    .replace(/ /g, '-')
    .replace(/_/g, '-')
    .split('/')
    .map((p) => slugify(p))
    .join('/');

  const url = new URL(pathname, 'https://qwikcity.builder.io/');
  pathname = url.pathname;

  if (opts.trailingSlash && !pathname.endsWith('/')) {
    pathname += '/';
  }
  return pathname;
}

export function getIndexLinkHref(
  opts: NormalizedPluginOptions,
  indexFilePath: string,
  href: string
) {
  const prefix = href.toLocaleLowerCase();
  if (
    prefix.startsWith('/') ||
    prefix.startsWith('https:') ||
    prefix.startsWith('http:') ||
    prefix.startsWith('file:')
  ) {
    return href;
  }

  const querySplit = href.split('?');
  const hashSplit = href.split('#');
  href = href.split('?')[0].split('#')[0];

  if (!isMarkdownFile(href)) {
    return href;
  }

  const indexDir = dirname(indexFilePath);
  const parts = normalizePath(href)
    .split('/')
    .filter((p) => p.length > 0);
  const filePath = join(indexDir, ...parts);

  let pathname = getPagePathname(opts, filePath);
  if (querySplit.length > 1) {
    pathname += '?' + querySplit[1];
  } else if (hashSplit.length > 1) {
    pathname += '#' + hashSplit[1];
  }
  return pathname;
}

import { relative, dirname, join } from 'path';
import type { NormalizedPluginOptions } from '../types';
import { getBasename, isMarkdownFileName, normalizePath } from './fs';

export function getPagePathname(opts: NormalizedPluginOptions, filePath: string) {
  let pathname = normalizePath(relative(opts.routesDir, filePath));

  const fileName = getBasename(pathname);
  const dirName = normalizePath(dirname(pathname));
  if (fileName === 'index') {
    if (dirName === '.') {
      return '/';
    }
    pathname = `/${dirName}`;
  } else if (fileName === 'endpoint') {
    pathname = `/${dirName}`;
  } else {
    pathname = `/${dirName}/${fileName}`;
  }

  return normalizePathname(opts, pathname);
}

export function getMenuPathname(opts: NormalizedPluginOptions, filePath: string) {
  let pathname = normalizePath(relative(opts.routesDir, filePath));
  pathname = `/` + normalizePath(dirname(pathname));
  return normalizePathname(opts, pathname);
}

export function normalizePathname(opts: NormalizedPluginOptions, pathname: string) {
  const url = new URL(pathname, 'https://qwikcity.builder.io/');
  pathname = url.pathname;

  if (opts.trailingSlash && !pathname.endsWith('/')) {
    pathname += '/';
  }
  return pathname;
}

export function getMenuLinkHref(opts: NormalizedPluginOptions, menuFilePath: string, href: string) {
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

  if (!isMarkdownFileName(href)) {
    return href;
  }

  const indexDir = dirname(menuFilePath);
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

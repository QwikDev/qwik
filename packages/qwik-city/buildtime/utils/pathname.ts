import { relative, dirname, join } from 'path';
import type { NormalizedPluginOptions } from '../types';
import { getExtensionLessBasename, isMarkdownFileName, normalizePath } from './fs';

export function getPathnameFromFilePath(opts: NormalizedPluginOptions, filePath: string) {
  // get relative file system path
  const relFilePath = relative(opts.routesDir, filePath);

  // ensure file system path uses / (POSIX) instead of \\ (windows)
  let pathname = normalizePath(relFilePath);

  // remove pathless segments (directories starting with "__")
  pathname = removePathlessSegments(pathname);

  const fileName = getExtensionLessBasename(pathname);
  const dirName = normalizePath(dirname(pathname));

  if (fileName === 'index') {
    if (dirName === '.') {
      return '/';
    }
    pathname = `/${dirName}`;
  } else {
    pathname = `/${dirName}/${fileName}`;
  }

  return normalizePathname(opts, pathname);
}

/**
 * Remove pathless segments (directories starting with "__")
 */
export function removePathlessSegments(pathname: string) {
  return pathname
    .split('/')
    .filter((segment) => !segment.startsWith('__'))
    .join('/');
}

export function getMenuPathname(opts: NormalizedPluginOptions, filePath: string) {
  let pathname = normalizePath(relative(opts.routesDir, filePath));
  pathname = `/` + normalizePath(dirname(pathname));
  return normalizePathname(opts, pathname);
}

function normalizePathname(opts: NormalizedPluginOptions, pathname: string) {
  pathname = new URL(pathname, 'https://qwik.builder.io/').pathname;

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

  let pathname = getPathnameFromFilePath(opts, filePath);
  if (querySplit.length > 1) {
    pathname += '?' + querySplit[1];
  } else if (hashSplit.length > 1) {
    pathname += '#' + hashSplit[1];
  }
  return pathname;
}

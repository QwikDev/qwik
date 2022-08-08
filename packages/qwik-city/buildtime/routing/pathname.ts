import { relative, dirname, join, extname, basename } from 'path';
import { getSourceFile } from './source-file';
import type { NormalizedPluginOptions } from '../types';
import { isMarkdownExt, normalizePath } from '../utils/fs';

export function parseRouteIndexName(extlessName: string) {
  let layoutName = '';
  const layoutStop = extlessName.endsWith('!');

  if (layoutStop) {
    extlessName = extlessName.slice(0, extlessName.length - 1);
  }

  const namedLayoutParts = extlessName.split('@');
  if (namedLayoutParts.length > 1) {
    namedLayoutParts.shift();
    layoutName = namedLayoutParts.join('@');
  }

  return { layoutName, layoutStop };
}

export function getPathnameFromDirPath(opts: NormalizedPluginOptions, dirPath: string) {
  // get relative file system path from the dirname
  // ignoring the already known "index" filename
  const relFilePath = relative(opts.routesDir, dirPath);

  // ensure file system path uses / (POSIX) instead of \\ (windows)
  const pathname = normalizePath(relFilePath);

  return (
    normalizePathname(opts, pathname)
      .split('/')
      // remove pathless segments (directories starting with "__")
      .filter((segment) => !segment.startsWith('__'))
      .join('/')
  );
}

export function getMenuPathname(opts: NormalizedPluginOptions, filePath: string) {
  let pathname = normalizePath(relative(opts.routesDir, filePath));
  pathname = `/` + normalizePath(dirname(pathname));
  return normalizePathname(opts, pathname);
}

export function normalizePathname(opts: NormalizedPluginOptions, pathname: string) {
  if (pathname.startsWith('/')) {
    pathname = pathname.slice(1);
  }
  pathname = opts.baseUrl + pathname;

  pathname = new URL(pathname, 'https://qwik.builder.io/').pathname;

  if (pathname !== '/') {
    if (opts.trailingSlash) {
      if (!pathname.endsWith('/')) {
        pathname += '/';
      }
    } else if (pathname.endsWith('/')) {
      pathname = pathname.slice(0, pathname.length - 1);
    }
  }
  return pathname;
}

export function getMenuLinkHref(opts: NormalizedPluginOptions, menuFilePath: string, href: string) {
  if (typeof href !== 'string' || href.charAt(0) === '/') {
    return href;
  }

  const protocol = href.split(':').pop()!.toLowerCase();
  if (PROTOCOLS[protocol]) {
    return href;
  }

  const querySplit = href.split('?');
  const hashSplit = href.split('#');
  href = href.split('?')[0].split('#')[0];

  if (isMarkdownExt(extname(href))) {
    const menuDirPath = dirname(menuFilePath);
    const parts = normalizePath(href)
      .split('/')
      .filter((p) => p.length > 0);
    const filePath = join(menuDirPath, ...parts);

    const fileName = basename(filePath);
    const sourceFileName = getSourceFile(fileName);
    if (sourceFileName) {
      const mdDirPath = dirname(filePath);
      let pathname = getPathnameFromDirPath(opts, mdDirPath);
      if (querySplit.length > 1) {
        pathname += '?' + querySplit[1];
      } else if (hashSplit.length > 1) {
        pathname += '#' + hashSplit[1];
      }
      return pathname;
    }
  }

  return href;
}

const PROTOCOLS: { [protocol: string]: boolean } = {
  https: true,
  http: true,
  about: true,
  javascript: true,
  file: true,
};

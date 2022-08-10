import { relative, dirname, join, basename } from 'path';
import { getSourceFile } from './source-file';
import type { NormalizedPluginOptions } from '../types';
import { getExtension, isMarkdownExt, normalizePath } from '../utils/fs';
import { existsSync } from 'fs';

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

export function isSameOriginUrl(url: string) {
  if (typeof url === 'string') {
    url = url.trim();
    if (url !== '') {
      const firstChar = url.charAt(0);
      if (firstChar !== '/' && firstChar !== '.') {
        if (firstChar === '#') {
          return false;
        }
        const i = url.indexOf(':');
        if (i > -1) {
          const protocol = url.slice(0, i).toLowerCase();
          return !PROTOCOLS[protocol];
        }
      }
      return true;
    }
  }
  return false;
}

export function getMarkdownRelativeUrl(
  opts: NormalizedPluginOptions,
  containingFilePath: string,
  url: string,
  checkFileExists?: boolean
) {
  if (typeof url !== 'string' || !isSameOriginUrl(url)) {
    return url;
  }

  const querySplit = url.split('?');
  const hashSplit = url.split('#');
  const strippedUrl = url.split('?')[0].split('#')[0];

  if (isMarkdownExt(getExtension(strippedUrl))) {
    const containingDirPath = dirname(containingFilePath);
    const parts = normalizePath(strippedUrl)
      .split('/')
      .filter((p) => p.length > 0);
    const filePath = join(containingDirPath, ...parts);

    if (checkFileExists) {
      if (!existsSync(filePath)) {
        console.warn(
          `\nThe link "${url}", found within "${containingFilePath}" does not have a matching source file.\n`
        );
      }
    }

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

  return url;
}

const PROTOCOLS: { [protocol: string]: boolean } = {
  https: true,
  http: true,
  about: true,
  javascript: true,
  file: true,
};

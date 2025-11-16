import { basename, dirname, normalize, relative } from 'node:path';
import type { NormalizedPluginOptions } from '../buildtime/types';
import { toTitleCase } from './format';
import { normalizePathname } from './pathname';

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
  let pathname = normalizePath(relFilePath);

  pathname = normalizePathname(pathname, opts.basePathname)!
    .split('/')
    // remove grouped layout segments
    .filter((segment) => !isGroupedLayoutName(segment))
    .join('/');
  if (pathname === '') {
    return '/';
  }
  return pathname;
}

export function getMenuPathname(opts: NormalizedPluginOptions, filePath: string) {
  let pathname = normalizePath(relative(opts.routesDir, filePath));
  pathname = `/` + normalizePath(dirname(pathname));
  let result = normalizePathname(pathname, opts.basePathname)!;
  if (!result.endsWith('/')) {
    result += '/';
  }
  return result;
}

export function getExtension(fileName: string) {
  if (typeof fileName === 'string') {
    const parts = fileName.trim().toLowerCase().split('.');
    if (parts.length > 1) {
      const ext = parts.pop()!.split('?')[0].split('#')[0];
      if (ext === 'ts' && parts.pop() === 'd') {
        return '.d.ts';
      }
      return '.' + ext;
    }
  }
  return '';
}

export function removeExtension(fileName: string) {
  if (typeof fileName === 'string') {
    fileName = fileName.trim();
    const ext = getExtension(fileName);
    return fileName.slice(0, fileName.length - ext.length);
  }
  return '';
}

export function normalizePath(path: string) {
  return normalizePathSlash(normalize(path));
}

export function normalizePathSlash(path: string) {
  // MIT https://github.com/sindresorhus/slash/blob/main/license
  // Convert Windows backslash paths to slash paths: foo\\bar ➔ foo/bar
  const isExtendedLengthPath = path.startsWith('\\\\?\\');
  const hasNonAscii = /[^\u0000-\u0080]+/.test(path); // eslint-disable-line no-control-regex

  if (isExtendedLengthPath || hasNonAscii) {
    return path;
  }

  path = path.replace(/\\/g, '/');
  if (path.endsWith('/')) {
    path = path.slice(0, path.length - 1);
  }
  return path;
}

/**
 * Creates an id for the module, based on its path.
 *
 * @param routesDir
 * @param fsPath
 * @param explicitFileType Add to avoid collisions between different types of modules. `Menu` and
 *   `Layout` files are named based on their path (eg. /routes/about/menu.md => AboutMenu)
 */
export function createFileId(
  routesDir: string,
  fsPath: string,
  explicitFileType?: 'Route' | 'Plugin' | 'ServiceWorker'
) {
  const ids: string[] = [];

  for (let i = 0; i < 25; i++) {
    let baseName = removeExtension(basename(fsPath));

    baseName = baseName.replace(/[\W_]+/g, '');
    if (baseName === '') {
      baseName = 'Q' + i;
    } else if (!isNaN(baseName.charAt(0) as any)) {
      baseName = 'Q' + baseName;
    }
    ids.push(toTitleCase(baseName));

    fsPath = normalizePath(dirname(fsPath));

    if (fsPath === routesDir) {
      break;
    }
  }

  if (ids.length > 1 && ids[0] === 'Index') {
    ids.shift();
  }

  return ids
    .reverse()
    .join('')
    .concat(explicitFileType || '');
}

const PAGE_MODULE_EXTS: { [type: string]: boolean } = {
  '.tsx': true,
  '.jsx': true,
} as const;

const MODULE_EXTS: { [type: string]: boolean } = {
  '.ts': true,
  '.js': true,
} as const;

const MARKDOWN_EXTS: { [type: string]: boolean } = {
  '.md': true,
  '.mdx': true,
} as const;

export function isIndexModule(extlessName: string) {
  return /^index(|!|@.+)$/.test(extlessName);
}

export function isPluginModule(extlessName: string) {
  return /^plugin(|@.+)$/.test(extlessName);
}

export function isLayoutModule(extlessName: string) {
  return /^layout(|!|-.+)$/.test(extlessName);
}

export function isPageModuleExt(ext: string) {
  return ext in PAGE_MODULE_EXTS;
}

export function isModuleExt(ext: string) {
  return ext in MODULE_EXTS;
}

export function isMarkdownExt(ext: string) {
  return ext in MARKDOWN_EXTS;
}

export function isPageExt(ext: string) {
  return ext in PAGE_MODULE_EXTS || ext in MARKDOWN_EXTS;
}

export function isMenuFileName(fileName: string) {
  return fileName === 'menu.md';
}

export function isServiceWorkerName(extlessName: string) {
  return extlessName === 'service-worker';
}

export function isEntryName(extlessName: string) {
  return extlessName === 'entry';
}

export function isErrorName(extlessName: string) {
  return /^[45][0-9]{2}$/.test(extlessName);
}

export function isGroupedLayoutName(dirName: string, warn = true) {
  if (dirName.startsWith('__')) {
    if (warn) {
      console.warn(
        `Grouped (pathless) layout "${dirName}" should use the "(${dirName.slice(
          2
        )})" directory name instead. Prefixing a directory with "__" has been deprecated and will be removed in future versions.`
      );
    }
    return true;
  }
  return dirName.startsWith('(') && dirName.endsWith(')');
}

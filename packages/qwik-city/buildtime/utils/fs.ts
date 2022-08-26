import { basename, dirname, normalize } from 'path';
import { toTitleCase } from './format';

export function getExtension(fileName: string) {
  if (typeof fileName === 'string') {
    const parts = fileName.trim().toLowerCase().split('.');
    if (parts.length > 1) {
      const ext = parts.pop()!;
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
  path = normalize(path);

  // MIT https://github.com/sindresorhus/slash/blob/main/license
  // Convert Windows backslash paths to slash paths: foo\\bar ➔ foo/bar
  const isExtendedLengthPath = /^\\\\\?\\/.test(path);
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

export function createFileId(routesDir: string, path: string) {
  const ids: string[] = [];

  for (let i = 0; i < 25; i++) {
    let baseName = removeExtension(basename(path));

    baseName = baseName.replace(/[\W_]+/g, '');
    if (baseName === '') {
      baseName = 'Q' + i;
    } else if (!isNaN(baseName.charAt(0) as any)) {
      baseName = 'Q' + baseName;
    }
    ids.push(toTitleCase(baseName));

    path = normalizePath(dirname(path));

    if (path === routesDir) {
      break;
    }
  }

  if (ids.length > 1 && ids[0] === 'Index') {
    ids.shift();
  }

  return ids.reverse().join('');
}

const PAGE_MODULE_EXTS: { [type: string]: boolean } = {
  '.tsx': true,
  '.jsx': true,
};

const MODULE_EXTS: { [type: string]: boolean } = {
  '.ts': true,
  '.js': true,
};

const MARKDOWN_EXTS: { [type: string]: boolean } = {
  '.md': true,
  '.mdx': true,
};

export function isPageModuleExt(ext: string) {
  return !!PAGE_MODULE_EXTS[ext];
}

export function isModuleExt(ext: string) {
  return !!MODULE_EXTS[ext];
}

export function isMarkdownExt(ext: string) {
  return !!MARKDOWN_EXTS[ext];
}

export function isPageExt(ext: string) {
  return !!PAGE_MODULE_EXTS[ext] || !!MARKDOWN_EXTS[ext];
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
  try {
    const statusCode = parseInt(extlessName, 10);
    return statusCode >= 400 && statusCode <= 599;
  } catch (e) {
    //
  }
  return false;
}

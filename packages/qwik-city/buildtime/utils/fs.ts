import { basename, dirname, extname, normalize } from 'path';
import { toTitleCase } from './format';

export function getExtension(fileName: string) {
  return extname(fileName).toLowerCase();
}

export function getExtensionLessBasename(path: string) {
  const parts = basename(path).split('.');
  if (parts.length > 1) {
    parts.pop();
  }
  return parts.join('.');
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
    let baseName = i === 0 ? getExtensionLessBasename(path) : basename(path);

    baseName = baseName.replace(/[\W_]+/g, '');
    if (baseName === '') {
      baseName = 'Q' + i;
    }
    ids.push(toTitleCase(baseName));

    path = normalizePath(dirname(path));

    if (path === routesDir) {
      break;
    }
  }

  return ids.reverse().join('');
}

export const MARKDOWN_EXT: { [ext: string]: boolean } = {
  '.mdx': true,
  '.md': true,
};

export function isMarkdownExt(ext: string) {
  return !!MARKDOWN_EXT[ext];
}

const PAGE_EXT: { [ext: string]: boolean } = {
  '.tsx': true,
  '.jsx': true,
};

export function isPageExt(ext: string) {
  return !!PAGE_EXT[ext];
}

export function isPageIndexFileName(fileName: string, ext: string) {
  if (fileName.startsWith('index')) {
    return isPageExt(ext);
  }
  return false;
}

const ENDPOINT_EXT: { [ext: string]: boolean } = {
  '.ts': true,
  '.js': true,
};

export function isEndpointFileName(fileName: string, ext: string) {
  return !!ENDPOINT_EXT[ext] && !fileName.endsWith('.d.ts');
}

export function isMenuFileName(fileName: string) {
  return fileName === '_menu.md';
}

export function isLayoutName(fileName: string) {
  return fileName.startsWith('_layout');
}

export function isLayoutFileName(dirName: string, fileName: string, ext: string) {
  if (isLayoutName(fileName)) {
    if (isPageExt(ext)) {
      // _layout.tsx
      // _layout-name.tsx
      return true;
    }
  } else if (isLayoutName(dirName)) {
    if (isPageIndexFileName(fileName, ext)) {
      // _layout/index.tsx
      // _layout-name/index.tsx
      return true;
    }
  }
  return false;
}

export function isTestFileName(fileName: string) {
  return (
    fileName.includes('.spec.') ||
    fileName.includes('.unit.') ||
    fileName.includes('.e2e.') ||
    fileName.includes('.test.')
  );
}

export function isTestDirName(fileName: string) {
  return fileName === '__test__' || fileName === '__tests__';
}

import { basename, dirname, extname, normalize } from 'path';
import type { BuildContext } from '../types';
import { toTitleCase } from './format';

const MARKDOWN_EXT: { [ext: string]: boolean } = {
  '.mdx': true,
  '.md': true,
};

const PAGE_EXT: { [ext: string]: boolean } = {
  '.tsx': true,
  '.jsx': true,
};

const ENDPOINT_EXT: { [ext: string]: boolean } = {
  '.ts': true,
  '.js': true,
};

export function isPageFileName(fileName: string) {
  const ext = extname(fileName).toLowerCase();
  return PAGE_EXT[ext];
}

export function isMarkdownFileName(fileName: string) {
  const ext = extname(fileName).toLowerCase();
  return MARKDOWN_EXT[ext];
}

export function isEndpointFileName(fileName: string) {
  const ext = extname(fileName.toLowerCase());
  return ENDPOINT_EXT[ext] && !fileName.endsWith('.d.ts');
}

export function isLayoutFileName(fileName: string) {
  return isLayoutTopFileName(fileName) || isLayoutNestedFileName(fileName);
}

export function isLayoutTopFileName(fileName: string) {
  return fileName === '_layout-top.tsx';
}

export function isLayoutNestedFileName(fileName: string) {
  return fileName === '_layout-nested.tsx';
}

export function isMenuFileName(fileName: string) {
  return fileName === '_menu.md';
}

export function getPagesBuildPath(pathname: string) {
  if (pathname === '/') {
    pathname += 'index';
  }
  const filename = pathname.split('/').pop();
  if (filename !== 'index') {
    pathname += '/index';
  }
  return `pages${pathname}.js`;
}

export function getBasename(filePath: string) {
  if (filePath.endsWith('.tsx')) {
    return basename(filePath, '.tsx');
  }
  if (filePath.endsWith('.ts')) {
    return basename(filePath, '.ts');
  }
  if (filePath.endsWith('.mdx')) {
    return basename(filePath, '.mdx');
  }
  if (filePath.endsWith('.md')) {
    return basename(filePath, '.md');
  }
  return basename(filePath);
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

  return path.replace(/\\/g, '/');
}

export function createFileId(ctx: BuildContext, routesDir: string, path: string) {
  const segments: string[] = [];

  for (let i = 0; i < 25; i++) {
    let baseName = getBasename(path);
    baseName = baseName.replace(/[\W_]+/g, '');
    if (baseName === '') {
      baseName = 'Q' + i;
    }
    baseName = toTitleCase(baseName);
    segments.push(baseName);

    path = normalizePath(dirname(path));
    if (path === routesDir) {
      break;
    }
  }

  const id = segments.reverse().join('');

  let inc = 1;
  let fileId = id;
  while (ctx.ids.has(fileId)) {
    fileId = `${id}_${inc++}`;
  }

  ctx.ids.add(fileId);

  return fileId;
}

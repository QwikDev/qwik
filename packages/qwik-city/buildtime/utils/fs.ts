import { basename, dirname, extname, normalize } from 'path';
import type { BuildContext } from '../types';
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

  return path.replace(/\\/g, '/');
}

export function createFileId(ctx: BuildContext, path: string) {
  const segments: string[] = [];

  for (let i = 0; i < 25; i++) {
    let baseName = i === 0 ? getExtensionLessBasename(path) : basename(path);

    baseName = baseName.replace(/[\W_]+/g, '');
    if (baseName === '') {
      baseName = 'Q' + i;
    }
    baseName = toTitleCase(baseName);
    segments.push(baseName);

    path = normalizePath(dirname(path));

    if (path === ctx.opts.routesDir) {
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

export const MARKDOWN_EXT: { [ext: string]: boolean } = {
  '.mdx': true,
  '.md': true,
};

export function isMarkdownFileName(fileName: string) {
  return MARKDOWN_EXT[getExtension(fileName)];
}

const PAGE_EXT: { [ext: string]: boolean } = {
  '.tsx': true,
  '.jsx': true,
};

export function isPageFileName(fileName: string) {
  return PAGE_EXT[getExtension(fileName)];
}

export function isPageIndexFileName(fileName: string) {
  if (fileName.startsWith('index')) {
    return isPageFileName(fileName);
  }
  return false;
}

const ENDPOINT_EXT: { [ext: string]: boolean } = {
  '.ts': true,
  '.js': true,
};

export function isEndpointFileName(fileName: string) {
  const ext = getExtension(fileName);
  return ENDPOINT_EXT[ext] && !fileName.endsWith('.d.ts');
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

/** File and directory names we already know we can just skip over */
export const IGNORE_FS_NAMES: { [key: string]: boolean } = {
  node_modules: true,
  '.gitignore': true,
  '.gitattributese': true,
  '.gitkeep': true,
  '.DS_Store': true,
  'thumbs.db': true,
};

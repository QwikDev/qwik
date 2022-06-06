import { basename, extname, normalize } from 'path';

export function isMarkdownFile(filePath: string) {
  const ext = extname(filePath).toLowerCase();
  return ext === '.mdx' || ext === '.md';
}

export function isTypeScriptFile(filePath: string) {
  const ext = extname(filePath).toLowerCase();
  return ext === '.tsx' || (ext === '.ts' && !filePath.endsWith('.d.ts'));
}

export function isLayoutFileName(filePath: string) {
  filePath = filePath.toLowerCase();
  return filePath === '_layout.tsx' || filePath === '_layout.ts';
}

export function isIndexFileName(filePath: string) {
  filePath = filePath.toLowerCase();
  return filePath === '_index';
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
  if (filePath.endsWith('.md')) {
    return basename(filePath, '.md');
  }
  if (filePath.endsWith('.mdx')) {
    return basename(filePath, '.mdx');
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

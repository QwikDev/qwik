import { basename, dirname } from 'path';
import type { BuildContext, BuildLayout } from '../types';
import {
  createFileId,
  isPageFileName,
  isPageIndexFileName,
  normalizePath,
  removeExtension,
} from '../utils/fs';

export function createLayout(ctx: BuildContext, routesDir: string, filePath: string) {
  let dirPath = dirname(filePath);
  const dirName = basename(dirPath);
  const fileName = removeExtension(basename(filePath));
  let layoutName = '';

  if (dirName.startsWith('_layout')) {
    layoutName = parseLayoutName(dirName);
    dirPath = dirname(dirPath);
  } else {
    layoutName = parseLayoutName(fileName);
  }

  const type = layoutName !== '' ? 'top' : 'nested';

  const layout: BuildLayout = {
    id: createFileId(ctx, routesDir, filePath),
    filePath: normalizePath(filePath),
    dir: normalizePath(dirPath),
    type,
    name: layoutName,
  };

  return layout;
}

export function isLayoutFileName(dirName: string, fileName: string) {
  if (fileName.startsWith('_layout') && isPageFileName(fileName)) {
    // _layout.tsx
    // _layout-name.tsx
    return true;
  }
  if (dirName.startsWith('_layout') && isPageIndexFileName(fileName)) {
    // _layout/index.tsx
    // _layout-name/index.tsx
    return true;
  }
  return false;
}

function parseLayoutName(fileName: string) {
  if (fileName.startsWith('_layout-')) {
    return fileName.slice(8);
  }
  return '';
}

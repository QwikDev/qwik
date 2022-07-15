import { dirname } from 'path';
import type { BuildContext, BuildLayout } from '../types';
import {
  createFileId,
  isPageFileName,
  isPageIndexFileName,
  getExtensionLessBasename,
  normalizePath,
} from '../utils/fs';

export function createLayout(
  ctx: BuildContext,
  dirPath: string,
  dirName: string,
  filePath: string
) {
  let layoutName = '';

  if (dirName.startsWith('_layout')) {
    layoutName = parseLayoutName(dirName);
    dirPath = normalizePath(dirname(dirPath));
  } else {
    layoutName = parseLayoutName(getExtensionLessBasename(filePath));
  }

  const type = layoutName !== '' ? 'top' : 'nested';

  const layout: BuildLayout = {
    id: createFileId(ctx, filePath),
    filePath: filePath,
    dir: dirPath,
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

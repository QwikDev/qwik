import { dirname } from 'path';
import type { BuildLayout, RouteSourceFile } from '../types';
import { createFileId, getExtensionLessBasename, normalizePath } from '../utils/fs';

export function resolveLayout(routesDir: string, layoutSourceFile: RouteSourceFile) {
  const dirName = layoutSourceFile.dirName;
  const filePath = layoutSourceFile.filePath;
  let dirPath = layoutSourceFile.dirPath;

  let layoutName = '';

  if (layoutSourceFile.dirName.startsWith('_layout')) {
    layoutName = parseLayoutName(dirName);
    dirPath = normalizePath(dirname(dirPath));
  } else {
    layoutName = parseLayoutName(getExtensionLessBasename(filePath));
  }

  const type = layoutName !== '' ? 'top' : 'nested';

  const layout: BuildLayout = {
    id: createFileId(routesDir, filePath),
    filePath,
    dirPath,
    type,
    layoutName,
  };

  return layout;
}

function parseLayoutName(fileName: string) {
  if (fileName.startsWith('_layout-')) {
    return fileName.slice(8);
  }
  return '';
}

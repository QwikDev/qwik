import {
  getExtension,
  isEntryName,
  isErrorName,
  isIndexModule,
  isLayoutModule,
  isMarkdownExt,
  isMenuFileName,
  isModuleExt,
  isPageModuleExt,
  isServiceWorkerName,
  removeExtension,
} from '../../utils/fs';
import type { RouteSourceFileName, RouteSourceType } from '../types';

export function getSourceFile(fileName: string) {
  const ext = getExtension(fileName);
  const extlessName = removeExtension(fileName);
  const isPageModule = isPageModuleExt(ext);
  const isModule = isModuleExt(ext);
  const isMarkdown = isMarkdownExt(ext);
  let type: RouteSourceType | null = null;

  if (
    (isIndexModule(extlessName) || isErrorName(extlessName)) &&
    (isPageModule || isModule || isMarkdown)
  ) {
    // route page or endpoint
    // index@layoutname or index! - ts|tsx|js|jsx|md|mdx
    type = 'route';
  } else if (isLayoutModule(extlessName) && (isPageModule || isModule)) {
    // layout-name or layout! - ts|tsx|js|jsx
    type = 'layout';
  } else if (isEntryName(extlessName) && isModule) {
    // entry module - ts|js
    type = 'entry';
  } else if (isMenuFileName(fileName)) {
    // menu.md
    type = 'menu';
  } else if (isModule && isServiceWorkerName(extlessName)) {
    // service-worker.ts|js
    type = 'service-worker';
  }

  if (type !== null) {
    const sourceFileName: RouteSourceFileName = {
      type,
      extlessName,
      ext,
    };
    return sourceFileName;
  }

  return null;
}

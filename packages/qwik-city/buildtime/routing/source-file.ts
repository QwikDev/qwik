import { extname } from 'path';
import { resolveMenu } from '../markdown/menu';
import type { BuildContext, NormalizedPluginOptions, RouteSourceFile } from '../types';
import { addError } from '../utils/format';
import {
  isEndpointFileName,
  isLayoutFileName,
  isMarkdownExt,
  isMenuFileName,
  isPageExt,
  isTestDirName,
  isTestFileName,
} from '../utils/fs';
import { resolveEndpointRoute } from './endpoint';
import { resolveLayout } from './layout';
import { resolvePageModuleRoute } from './page';
import { sortRoutes } from './sort-routes';

export async function resolveSourceFiles(
  opts: NormalizedPluginOptions,
  sourceFiles: RouteSourceFile[]
) {
  const routesDir = opts.routesDir;

  const layouts = sourceFiles
    .filter((s) => s.type === 'layout')
    .map((s) => resolveLayout(routesDir, s))
    .sort((a, b) => {
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });

  const pageRoutes = sourceFiles
    .filter((s) => s.type === 'page')
    .map((p) => resolvePageModuleRoute(opts, p, layouts));

  const endpointRoutes = sourceFiles
    .filter((s) => s.type === 'endpoint')
    .map((p) => resolveEndpointRoute(opts, p));

  const menus = sourceFiles
    .filter((s) => s.type === 'menu')
    .map((p) => resolveMenu(opts, p))
    .sort((a, b) => {
      if (a.pathname < b.pathname) return -1;
      if (a.pathname > b.pathname) return 1;
      return 0;
    });

  const routes = [...pageRoutes, ...endpointRoutes].sort(sortRoutes);

  return { layouts, routes, menus };
}

export function getSourceFile(
  dirPath: string,
  dirName: string,
  filePath: string,
  fileName: string
) {
  const ext = extname(fileName).toLowerCase();

  const type = isLayoutFileName(dirName, fileName, ext)
    ? 'layout'
    : isMenuFileName(fileName)
    ? 'menu'
    : isEndpointFileName(fileName, ext)
    ? 'endpoint'
    : isMarkdownExt(ext) || isPageExt(ext)
    ? 'page'
    : null;

  if (type !== null) {
    const sourceFile: RouteSourceFile = {
      type,
      dirPath,
      dirName,
      filePath,
      fileName,
      ext,
    };
    return sourceFile;
  }

  return null;
}

export function validateSourceFiles(ctx: BuildContext, sourceFiles: RouteSourceFile[]) {
  for (const sourceFile of sourceFiles) {
    const err = validateSourceFile(sourceFile);
    if (err) {
      addError(ctx, err);
    }
  }
}

function validateSourceFile(sourceFile: RouteSourceFile) {
  if (isTestDirName(sourceFile.dirName)) {
    return `Test directory "${sourceFile.filePath}" should not be included within the routes directory. Please move test directories to a different location.`;
  }

  if (isTestFileName(sourceFile.fileName)) {
    return `Test file "${sourceFile.filePath}" should not be included within the routes directory. Please move test files to a different location.`;
  }

  if (sourceFile.dirName.includes('@')) {
    return `Route directories cannot have a named layout. Please change the named layout from the directory "${sourceFile.dirPath}" to a file.`;
  }

  return null;
}

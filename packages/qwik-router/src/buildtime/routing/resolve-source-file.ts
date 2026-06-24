import { dirname } from 'node:path';
import type { BuiltLayout, BuiltRoute, NormalizedPluginOptions, RouteSourceFile } from '../types';
import {
  createFileId,
  getPathnameFromDirPath,
  parseRouteIndexName,
  normalizePath,
} from '../../utils/fs';
import { parseRoutePathname } from './parse-pathname';

export function resolveLayout(opts: NormalizedPluginOptions, layoutSourceFile: RouteSourceFile) {
  let extlessName = layoutSourceFile.extlessName;
  const filePath = layoutSourceFile.filePath;
  const dirPath = layoutSourceFile.dirPath;

  let layoutName: string;
  let layoutType: 'nested' | 'top';

  if (extlessName.endsWith(LAYOUT_TOP_SUFFIX)) {
    layoutType = 'top';
    extlessName = extlessName.slice(0, extlessName.length - 1);
  } else {
    layoutType = 'nested';
  }

  if (extlessName.startsWith(LAYOUT_NAMED_PREFIX)) {
    layoutName = extlessName.slice(LAYOUT_NAMED_PREFIX.length);
  } else {
    layoutName = '';
  }

  const layout: BuiltLayout = {
    id: createFileId(opts.routesDir, filePath),
    filePath,
    dirPath,
    layoutType,
    layoutName,
  };

  return layout;
}

const LAYOUT_ID = 'layout';
const LAYOUT_NAMED_PREFIX = LAYOUT_ID + '-';
const LAYOUT_TOP_SUFFIX = '!';

export function resolveRoute(
  opts: NormalizedPluginOptions,
  appLayouts: BuiltLayout[],
  sourceFile: RouteSourceFile
): BuiltRoute {
  const filePath = sourceFile.filePath;
  const layouts: BuiltLayout[] = [];
  const routesDir = opts.routesDir;
  const { layoutName, layoutStop } = parseRouteIndexName(sourceFile.extlessName);
  let pathname = getPathnameFromDirPath(opts, sourceFile.dirPath);

  if (sourceFile.extlessName === '404' || sourceFile.extlessName === 'error') {
    // TODO is this needed, probably was only for 404.html SSG output
    pathname += sourceFile.extlessName + '.html';
  }

  if (!layoutStop) {
    let currentDir = normalizePath(dirname(filePath));
    let hasFoundNamedLayout = false;
    const hasNamedLayout = layoutName !== '';

    for (let i = 0; i < 20; i++) {
      let layout: BuiltLayout | undefined = undefined;

      if (hasNamedLayout && !hasFoundNamedLayout) {
        layout = appLayouts.find((l) => l.dirPath === currentDir && l.layoutName === layoutName);
        if (layout) {
          hasFoundNamedLayout = true;
        }
      } else {
        layout = appLayouts.find((l) => l.dirPath === currentDir && l.layoutName === '');
      }

      if (layout) {
        layouts.push(layout);
        if (layout.layoutType === 'top') {
          break;
        }
      }

      if (currentDir === routesDir) {
        break;
      }

      currentDir = normalizePath(dirname(currentDir));
    }
  }

  return {
    id: createFileId(opts.routesDir, filePath, 'Route'),
    filePath,
    pathname,
    layouts: layouts.reverse(),
    ext: sourceFile.ext,
    ...parseRoutePathname(opts.basePathname, pathname),
  };
}

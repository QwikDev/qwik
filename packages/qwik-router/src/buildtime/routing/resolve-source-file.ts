import { dirname } from 'node:path';
import { resolveMenu } from '../markdown/menu';
import type {
  BuiltEntry,
  BuiltLayout,
  BuiltRoute,
  BuiltServerPlugin,
  NormalizedPluginOptions,
  RouteSourceFile,
} from '../types';
import {
  createFileId,
  getPathnameFromDirPath,
  parseRouteIndexName,
  normalizePath,
} from '../../utils/fs';
import { parseRoutePathname } from './parse-pathname';
import { routeSortCompare } from './sort-routes';

export function resolveSourceFiles(opts: NormalizedPluginOptions, sourceFiles: RouteSourceFile[]) {
  const layouts = sourceFiles
    .filter((s) => s.type === 'layout')
    .map((s) => resolveLayout(opts, s))
    .sort((a, b) => {
      return a.id < b.id ? -1 : 1;
    });

  const routes = sourceFiles
    .filter((s) => s.type === 'route')
    .map((s) => resolveRoute(opts, layouts, s))
    .sort(routeSortCompare);

  const entries = sourceFiles
    .filter((s) => s.type === 'entry')
    .map((s) => resolveEntry(opts, s))
    .sort((a, b) => {
      return a.chunkFileName < b.chunkFileName ? -1 : 1;
    });

  const serviceWorkers = sourceFiles
    .filter((s) => s.type === 'service-worker')
    .map((p) => resolveServiceWorkerEntry(opts, p))
    .sort((a, b) => {
      return a.chunkFileName < b.chunkFileName ? -1 : 1;
    });

  const menus = sourceFiles
    .filter((s) => s.type === 'menu')
    .map((p) => resolveMenu(opts, p))
    .sort((a, b) => {
      return a.pathname < b.pathname ? -1 : 1;
    });

  let inc = 0;
  const ids = new Set<string>();
  const uniqueIds = (b: { id: string }[]) => {
    for (const r of b) {
      let id = r.id;
      while (ids.has(id)) {
        id = `${r.id}_${inc++}`;
      }
      r.id = id;
      ids.add(id);
    }
  };

  uniqueIds(layouts);
  uniqueIds(routes);
  uniqueIds(entries);
  uniqueIds(serviceWorkers);

  return { layouts, routes, entries, menus, serviceWorkers };
}

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
) {
  const filePath = sourceFile.filePath;
  const layouts: BuiltLayout[] = [];
  const routesDir = opts.routesDir;
  const { layoutName, layoutStop } = parseRouteIndexName(sourceFile.extlessName);
  let pathname = getPathnameFromDirPath(opts, sourceFile.dirPath);

  if (sourceFile.extlessName === '404') {
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

  const buildRoute: BuiltRoute = {
    id: createFileId(opts.routesDir, filePath, 'Route'),
    filePath,
    pathname,
    layouts: layouts.reverse(),
    ext: sourceFile.ext,
    ...parseRoutePathname(opts.basePathname, pathname),
  };

  return buildRoute;
}

export function resolveServerPlugin(opts: NormalizedPluginOptions, sourceFile: RouteSourceFile) {
  const filePath = sourceFile.filePath;
  const buildRoute: BuiltServerPlugin = {
    id: createFileId(opts.serverPluginsDir, filePath, 'Plugin'),
    filePath,
    ext: sourceFile.ext,
  };
  return buildRoute;
}

function resolveEntry(opts: NormalizedPluginOptions, sourceFile: RouteSourceFile) {
  const pathname = getPathnameFromDirPath(opts, sourceFile.dirPath);
  const chunkFileName = pathname.slice(opts.basePathname.length);

  const buildEntry: BuiltEntry = {
    id: createFileId(opts.routesDir, sourceFile.filePath, 'Route'),
    filePath: sourceFile.filePath,
    chunkFileName,
    ...parseRoutePathname(opts.basePathname, pathname),
  };

  return buildEntry;
}

function resolveServiceWorkerEntry(opts: NormalizedPluginOptions, sourceFile: RouteSourceFile) {
  const dirPathname = getPathnameFromDirPath(opts, sourceFile.dirPath);
  const pathname = dirPathname + sourceFile.extlessName + '.js';
  const chunkFileName = pathname.slice(opts.basePathname.length);

  const buildEntry: BuiltEntry = {
    id: createFileId(opts.routesDir, sourceFile.filePath, 'ServiceWorker'),
    filePath: sourceFile.filePath,
    chunkFileName,
    ...parseRoutePathname(opts.basePathname, pathname),
  };

  return buildEntry;
}

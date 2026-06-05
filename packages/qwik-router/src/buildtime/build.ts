import { addError, addWarning } from '../utils/format';
import { createFileId, getPathnameFromDirPath } from '../utils/fs';
import { ensureSlash } from '../utils/pathname';
import { resolveMenu } from './markdown/menu';
import { resolveLayout, resolveRoute } from './routing/resolve-source-file';
import { routeSortCompare } from './routing/sort-routes';
import { walkRoutes } from './routing/walk-routes-dir';
import { walkServerPlugins } from './routing/walk-server-plugins';
import { parseRoutePathname } from './routing/parse-pathname';
import type {
  BuildTrieNode,
  BuiltEntry,
  BuiltLayout,
  BuiltMenu,
  BuiltRoute,
  NormalizedPluginOptions,
  RewriteRouteOption,
  RouteSourceFile,
  RoutingContext,
} from './types';

export async function parseRoutesDir(ctx: RoutingContext) {
  try {
    await updateRoutingContext(ctx);
    validateBuild(ctx);
  } catch (e) {
    addError(ctx, e);
  }

  for (const d of ctx.diagnostics) {
    if (d.type === 'error') {
      throw new Error(d.message);
    } else {
      console.warn(d.message);
    }
  }
}

export function updateRoutingContext(ctx: RoutingContext) {
  ctx.activeBuild ||= _updateRoutingContext(ctx).finally(() => {
    ctx.activeBuild = null;
  });
  return ctx.activeBuild;
}

async function _updateRoutingContext(ctx: RoutingContext) {
  const serverPlugins = await walkServerPlugins(ctx.opts);
  const routeTrie = await walkRoutes(ctx.opts.routesDir);

  // Populate _G nodes in the trie for rewrite routes
  if (ctx.opts.rewriteRoutes) {
    applyRewriteRoutes(routeTrie, ctx.opts.rewriteRoutes);
  }

  ctx.routeTrie = routeTrie;
  ctx.serverPlugins = serverPlugins;

  // Derive flat arrays from the trie for backward compat
  const derived = deriveFromTrie(ctx.opts, routeTrie);
  ctx.layouts = derived.layouts;
  ctx.routes = rewriteRoutes(ctx, derived.routes);
  ctx.entries = derived.entries;
  ctx.serviceWorkers = derived.serviceWorkers;
  ctx.menus = derived.menus;
}

/**
 * Walk the trie and extract flat arrays for layouts, routes, entries, menus, service workers. These
 * are needed by generate-entries, generate-menus, generate-service-worker, vite plugin, etc.
 */
function deriveFromTrie(opts: NormalizedPluginOptions, root: BuildTrieNode) {
  const layouts: BuiltLayout[] = [];
  const routes: BuiltRoute[] = [];
  const entries: BuiltEntry[] = [];
  const serviceWorkers: BuiltEntry[] = [];
  const menus: BuiltMenu[] = [];

  // Collect all source files from the trie
  const allFiles: RouteSourceFile[] = [];
  function collectAllFiles(node: BuildTrieNode) {
    allFiles.push(...node._files);
    for (const child of node.children.values()) {
      collectAllFiles(child);
    }
  }
  collectAllFiles(root);

  // Pass 1: resolve all layouts first (resolveRoute needs the full layouts array)
  for (const file of allFiles) {
    if (file.type === 'layout') {
      layouts.push(resolveLayout(opts, file));
    }
  }

  // Pass 2: resolve routes, entries, menus, service workers
  for (const file of allFiles) {
    switch (file.type) {
      case 'route':
        routes.push(resolveRoute(opts, layouts, file));
        break;
      case 'entry':
        entries.push(resolveEntry(opts, file));
        break;
      case 'service-worker':
        serviceWorkers.push(resolveServiceWorkerEntry(opts, file));
        break;
      case 'menu':
        menus.push(resolveMenu(opts, file));
        break;
    }
  }

  // Ensure unique IDs
  let inc = 0;
  const ids = new Set<string>();
  const uniqueIds = (items: { id: string }[]) => {
    for (const item of items) {
      let id = item.id;
      while (ids.has(id)) {
        id = `${item.id}_${inc++}`;
      }
      item.id = id;
      ids.add(id);
    }
  };

  uniqueIds(layouts);
  uniqueIds(routes);
  uniqueIds(entries);
  uniqueIds(serviceWorkers);

  layouts.sort((a, b) => (a.id < b.id ? -1 : 1));
  entries.sort((a, b) => (a.chunkFileName < b.chunkFileName ? -1 : 1));
  serviceWorkers.sort((a, b) => (a.chunkFileName < b.chunkFileName ? -1 : 1));
  menus.sort((a, b) => (a.pathname < b.pathname ? -1 : 1));

  return { layouts, routes, entries, serviceWorkers, menus };
}

function resolveEntry(opts: NormalizedPluginOptions, sourceFile: RouteSourceFile): BuiltEntry {
  const pathname = getPathnameFromDirPath(opts, sourceFile.dirPath);
  const chunkFileName = pathname.slice(opts.basePathname.length);

  return {
    id: createFileId(opts.routesDir, sourceFile.filePath, 'Route'),
    filePath: sourceFile.filePath,
    chunkFileName,
    ...parseRoutePathname(opts.basePathname, pathname),
  };
}

function resolveServiceWorkerEntry(
  opts: NormalizedPluginOptions,
  sourceFile: RouteSourceFile
): BuiltEntry {
  const dirPathname = getPathnameFromDirPath(opts, sourceFile.dirPath);
  const pathname = dirPathname + sourceFile.extlessName + '.js';
  const chunkFileName = pathname.slice(opts.basePathname.length);

  return {
    id: createFileId(opts.routesDir, sourceFile.filePath, 'ServiceWorker'),
    filePath: sourceFile.filePath,
    chunkFileName,
    ...parseRoutePathname(opts.basePathname, pathname),
  };
}

/**
 * Create rewritten route copies for each rewrite config. For backward compat: produces BuiltRoute
 * entries with translated pathnames. At runtime, codegen emits /G nodes in the trie instead.
 */
function rewriteRoutes(ctx: RoutingContext, routes: BuiltRoute[]) {
  if (!ctx.opts.rewriteRoutes) {
    return routes;
  }

  const translatedRoutes: BuiltRoute[] = [];

  let segmentsToTranslate = ctx.opts.rewriteRoutes.flatMap((rewriteConfig) => {
    return Object.keys(rewriteConfig.paths || {});
  });

  segmentsToTranslate = Array.from(new Set(segmentsToTranslate));

  routes.forEach((route) => {
    translatedRoutes.push(route);

    const currentRouteSegments = route.pathname.split('/');
    const foundSegmentToTranslate = currentRouteSegments.some((segment) =>
      segmentsToTranslate.includes(segment)
    );

    if (foundSegmentToTranslate || route.pathname === '/') {
      ctx.opts.rewriteRoutes.forEach((config, configIndex) => {
        if (route.pathname === '/' && !config.prefix) {
          return;
        }
        const routeToPush = translateRoute(route, config, configIndex);

        if (
          !translatedRoutes.some(
            (item) =>
              item.pathname === routeToPush.pathname && item.routeName === routeToPush.routeName
          )
        ) {
          translatedRoutes.push(routeToPush);
        }
      });
    }
  });

  return translatedRoutes.sort(routeSortCompare);
}

function translateRoute(
  route: BuiltRoute,
  config: RewriteRouteOption,
  configIndex: number
): BuiltRoute {
  const replacePath = (part: string) => (config.paths || {})[part] ?? part;

  const pathnamePrefix = config.prefix ? '/' + config.prefix : '';
  const routeNamePrefix = config.prefix ? ensureSlash(config.prefix) : '';
  const idSuffix = config.prefix?.toUpperCase().replace(/-/g, '');
  const patternInfix = config.prefix ? [config.prefix] : [];

  const splittedPathName = route.pathname.split('/');
  const translatedPathParts = splittedPathName.map(replacePath);

  const splittedRouteName = route.routeName.split('/');
  const translatedRouteParts = splittedRouteName.map(replacePath);

  const splittedPattern = route.pattern.toString().split('\\/');
  const [translatedPatternFirst, ...translatedPatternOthers] = splittedPattern.map(replacePath);
  const translatedPatternParts = [
    translatedPatternFirst,
    ...patternInfix,
    ...translatedPatternOthers,
  ];
  const translatedPatternString = translatedPatternParts.join('\\/');
  const translatedRegExp = translatedPatternString.substring(
    1,
    route.pathname === '/' ? translatedPatternString.length - 1 : translatedPatternString.length - 2
  );

  const translatedSegments = route.segments.map((segment) =>
    segment.map((item) => ({ ...item, content: replacePath(item.content) }))
  );

  if (config.prefix) {
    translatedSegments.splice(0, 0, [
      {
        content: config.prefix,
        dynamic: false,
        rest: false,
      },
    ]);
  }

  const translatedPath = translatedPathParts.join('/');
  const translatedRoute = translatedRouteParts.join('/');

  return {
    ...route,
    id: route.id + (idSuffix || configIndex),
    pathname: pathnamePrefix + translatedPath,
    routeName: routeNamePrefix + (translatedRoute !== '/' ? translatedRoute : ''),
    pattern: new RegExp(translatedRegExp),
    segments: translatedSegments,
  };
}

/**
 * Walk the trie and create _G (rewrite) nodes for each rewriteRoutes config.
 *
 * For each route in the trie, if any of its path segments are translatable (listed in a rewrite
 * config's `paths`), we create a parallel trie path with the translated segment names and set `_G`
 * on the leaf to point back to the original route's trie key path.
 *
 * The `_G` value is a `/`-separated string of trie keys (skipping group nodes), which the runtime
 * resolver uses to walk the trie and find the target route's loaders and layouts.
 */
function applyRewriteRoutes(root: BuildTrieNode, rewriteConfigs: RewriteRouteOption[]) {
  interface TriePathStep {
    key: string;
    paramName?: string;
    prefix?: string;
    suffix?: string;
  }

  // Collect all routable paths: array of [steps, node] where steps are the non-group trie keys
  // from root to the node, including wildcard metadata.
  const routables: { steps: TriePathStep[]; node: BuildTrieNode }[] = [];

  function walk(node: BuildTrieNode, steps: TriePathStep[]) {
    const hasRoute = node._files.some(
      (f) => f.type === 'route' && f.extlessName !== 'error' && f.extlessName !== '404'
    );
    if (hasRoute) {
      routables.push({ steps: [...steps], node });
    }
    for (const [key, child] of node.children) {
      const isGroup = key.startsWith('(') && key.endsWith(')');
      if (isGroup) {
        // Groups are pathless — skip in key path but continue walking
        walk(child, steps);
      } else {
        walk(child, [
          ...steps,
          {
            key,
            paramName: child._P,
            prefix: child._0,
            suffix: child._9,
          },
        ]);
      }
    }
  }

  walk(root, []);

  for (const config of rewriteConfigs) {
    const translations = config.paths || {};
    const translatable = new Set(Object.keys(translations).map((k) => k.toLowerCase()));

    for (const { steps } of routables) {
      // Check if any segment is translatable or if there's a prefix
      const hasTranslatable = steps.some((s) => translatable.has(s.key));
      if (!hasTranslatable && !config.prefix) {
        continue;
      }
      // Root index (steps.length === 0) only gets a rewrite when there's a prefix
      if (steps.length === 0 && !config.prefix) {
        continue;
      }

      // Build the original key path
      const originalKeyPath = steps.map((s) => s.key).join('/');

      // Build translated steps
      const translatedSteps: TriePathStep[] = [];

      if (config.prefix) {
        translatedSteps.push({ key: config.prefix.toLowerCase() });
      }

      for (const step of steps) {
        const translated = translations[step.key];
        translatedSteps.push({
          ...step,
          key: translated ? translated.toLowerCase() : step.key,
        });
      }

      // Skip if translated path equals original (no actual translation)
      const translatedKeyPath = translatedSteps.map((s) => s.key).join('/');
      if (translatedKeyPath === originalKeyPath) {
        continue;
      }

      // Create trie nodes for the translated path
      let current = root;
      for (const step of translatedSteps) {
        let child = current.children.get(step.key);
        if (!child) {
          child = {
            _files: [],
            _dirPath: '',
            children: new Map(),
          };
          if (step.paramName) {
            child._P = step.paramName;
          }
          if (step.prefix) {
            child._0 = step.prefix;
          }
          if (step.suffix) {
            child._9 = step.suffix;
          }
          current.children.set(step.key, child);
        }
        current = child;
      }

      // Set _G on the leaf to point to the original route
      current._G = originalKeyPath;
    }
  }
}

function validateBuild(ctx: RoutingContext) {
  const pathnames = Array.from(new Set(ctx.routes.map((r) => r.pathname))).sort();

  for (const pathname of pathnames) {
    const foundRoutes = ctx.routes.filter((r) => r.pathname === pathname);
    if (foundRoutes.length > 1) {
      addError(
        ctx,
        `More than one route has been found for pathname "${pathname}". Please narrow it down to only one of these:\n${foundRoutes
          .map((r) => `  - ${r.filePath}`)
          .join('\n')}`
      );
    }
  }

  ctx.layouts
    .filter((l) => l.layoutType === 'top')
    .forEach((l) => {
      addWarning(
        ctx,
        `The "top" layout feature, which is used by "${l.filePath}" has been deprecated and will be removed from future versions. In most cases the "group" layout feature can be used in its place: https://qwik.dev/docs/advanced/routing/`
      );
    });
}

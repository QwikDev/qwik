import type { QwikManifest, QwikVitePlugin } from '@qwik.dev/core/optimizer';
import { dirname } from 'node:path';
import {
  createFileId,
  getPathnameFromDirPath,
  caughtErrorName,
  isModuleExt,
  isPageExt,
  normalizePathKey,
  parseRouteIndexName,
  removeExtension,
} from '../../utils/fs';
import { escapeStaticTrieKey } from '../../utils/route-trie-key';
import type { BuildTrieNode, BuiltRoute, RoutingContext, RouteSourceFile } from '../types';
import { getImportPath } from './utils';
import { parseDirName } from '../routing/walk-routes-dir';

export type RouteLoaderSourceFiles = ReadonlyMap<string, readonly string[]>;

/** Check if a build trie key is a group directory name like `(common)` */
function isGroupKey(key: string) {
  return key.charCodeAt(0) === 40 /* '(' */;
}

/** The runtime trie key for a build trie key; `_W`/`_A` are the only non-static ones. */
function toRuntimeTrieKey(key: string) {
  return key === '_W' || key === '_A' ? key : escapeStaticTrieKey(key);
}

/** A rewrite target or base path with each segment converted to its runtime trie key. */
function toRuntimeTriePath(path: string, basePathname: string) {
  const baseKeys = basePathname
    .split('/')
    .map((segment) => escapeStaticTrieKey(segment.toLowerCase()));
  return baseKeys.join('/') + path.split('/').map(toRuntimeTrieKey).join('/');
}

function getRouteTriePath(routeName: string) {
  return routeName
    .split('/')
    .map((segment) => {
      const { key, paramName, prefix, suffix } = parseDirName(segment);
      return paramName
        ? `${prefix?.toLowerCase() ?? ''}[${key}]${suffix?.toLowerCase() ?? ''}`
        : key;
    })
    .filter((key) => key != null)
    .join('/');
}

/**
 * Serialize the build trie into JS code.
 *
 * Emits:
 *
 * - Layout imports and lazy loaders
 * - Route/page imports and lazy loaders
 * - Menu imports and lazy loaders
 * - The route trie object literal with _L, _I, _G, _B, _4, _E, _N, _P, _0, _9, _M
 */
export function createRoutes(
  ctx: RoutingContext,
  qwikPlugin: QwikVitePlugin,
  c: string[],
  esmImports: string[],
  isSSR: boolean,
  loadersByFile?: Map<string, string[]>,
  /**
   * Route file paths to drop from the production server plan (prerendered + server-free; see
   * server-exclude.ts). Empty/undefined for the SSG full plan, the client build, and dev.
   */
  serverExcludePaths?: ReadonlySet<string>,
  routeLoaderSourceFiles?: RouteLoaderSourceFiles
) {
  const routesByFilePath = new Map<string, BuiltRoute>();
  for (const route of ctx.routes) {
    if (
      !routesByFilePath.has(route.filePath) ||
      route.pathname === getPathnameFromDirPath(ctx.opts, dirname(route.filePath))
    ) {
      routesByFilePath.set(route.filePath, route);
    }
  }
  const includeEndpoints = isSSR;
  const dynamicImports = ctx.dynamicImports;

  // First pass: collect all layout, route, and menu file IDs, emit imports
  const layoutIdMap = new Map<string, string>(); // filePath → varName
  const routeIdMap = new Map<string, string>(); // filePath → loader expression
  const routeNamesByTriePath = new Map<string, string>();
  const menuIdMap = new Map<string, string>(); // filePath → varName

  let layoutCount = 0;
  let routeCount = 0;
  let menuCount = 0;

  // Collect all files from the trie
  collectFiles(ctx.routeTrie, (file, _node) => {
    if (file.type === 'layout') {
      const id = ctx.layouts.find((l) => l.filePath === file.filePath)?.id;
      if (id) {
        layoutIdMap.set(file.filePath, id);
        layoutCount++;
      }
    } else if (file.type === 'route') {
      const route = routesByFilePath.get(file.filePath);
      if (route) {
        routeCount++;
      }
    } else if (file.type === 'menu') {
      const id = createFileId(ctx.opts.routesDir, file.filePath);
      menuIdMap.set(file.filePath, id);
      menuCount++;
    }
  });

  // Emit layout imports
  if (layoutCount > 0) {
    c.push(`\n/** Qwik Router Layouts (${layoutCount}) */`);
    for (const [filePath, id] of layoutIdMap) {
      const importPath = JSON.stringify(getImportPath(filePath));
      if (dynamicImports) {
        c.push(`const ${id} = ()=>import(${importPath});`);
      } else {
        esmImports.push(`import * as ${id}_ from ${importPath};`);
        c.push(`const ${id} = ()=>${id}_;`);
      }
    }
  }

  // Emit menu imports
  if (menuCount > 0) {
    c.push(`\n/** Qwik Router Menus (${menuCount}) */`);
    for (const [filePath, id] of menuIdMap) {
      const importPath = JSON.stringify(getImportPath(filePath));
      if (dynamicImports) {
        c.push(`const ${id} = ()=>import(${importPath});`);
      } else {
        esmImports.push(`import * as ${id}_ from ${importPath};`);
        c.push(`const ${id} = ()=>${id}_;`);
      }
    }
  }

  // Emit route imports and build loader expression map
  c.push(`\n/** Qwik Router Routes (${routeCount}) */`);
  for (const route of ctx.routes) {
    const name = route.routeName.split('/').filter(Boolean).join('/');
    routeNamesByTriePath.set(getRouteTriePath(name), name);
    if (isPageExt(route.ext)) {
      // Skip the loader so the trie node prunes and the chunk tree-shakes out of the server bundle.
      if (serverExcludePaths?.has(route.filePath)) {
        continue;
      }
      const importPath = getImportPath(route.filePath);
      let loaderExpr: string;
      if (dynamicImports) {
        loaderExpr = `()=>import(${JSON.stringify(importPath)})`;
      } else {
        esmImports.push(`import * as ${route.id} from ${JSON.stringify(importPath)};`);
        loaderExpr = `()=>${route.id}`;
      }
      routeIdMap.set(route.filePath, loaderExpr);
    } else if (includeEndpoints && isModuleExt(route.ext)) {
      const importPath = getImportPath(route.filePath);
      esmImports.push(`import * as ${route.id} from ${JSON.stringify(importPath)};`);
      routeIdMap.set(route.filePath, `()=>${route.id}`);
    }
  }

  const baseSegments = ctx.opts.basePathname.split('/').filter((s) => s.length > 0);

  // Serialize the trie
  const trieStr = serializeBuildTrie(
    ctx,
    qwikPlugin,
    ctx.routeTrie,
    layoutIdMap,
    routeIdMap,
    routesByFilePath,
    menuIdMap,
    isSSR,
    '',
    baseSegments.join('/'),
    getRouteTriePath(baseSegments.join('/')),
    routeNamesByTriePath,
    loadersByFile,
    routeLoaderSourceFiles
  );

  // Note: both error.tsx and 404.tsx in the same directory is fine.
  // error.tsx (_E) handles ServerErrors (403, 500, etc.) and 404.tsx (_4) handles not-found routes.
  // They are tracked independently in the route trie.

  // Wrap the trie in the base pathname segments (e.g., '/qwikrouter-test/' → 'qwikrouter-test')
  // The runtime matcher receives the full URL pathname, so the trie must include the base prefix.
  let routesExpr = trieStr;
  for (let j = baseSegments.length - 1; j >= 0; j--) {
    const segment = baseSegments[j];
    const key = segment.toLowerCase();
    if (segment !== key) {
      routesExpr = `{ _S: ${JSON.stringify(segment)},${routesExpr.slice(1)}`;
    }
    routesExpr = `{ ${JSON.stringify(escapeStaticTrieKey(key))}: ${routesExpr} }`;
  }

  c.push(`export const routes = ${routesExpr};`);
}

function collectFiles(
  node: BuildTrieNode,
  cb: (file: RouteSourceFile, node: BuildTrieNode) => void
) {
  for (const file of node._files) {
    cb(file, node);
  }
  for (const child of node.children.values()) {
    collectFiles(child, cb);
  }
}

/** Serialize a BuildTrieNode using the resolved route layout chains. */
function serializeBuildTrie(
  ctx: RoutingContext,
  qwikPlugin: QwikVitePlugin,
  node: BuildTrieNode,
  layoutIdMap: Map<string, string>,
  routeIdMap: Map<string, string>,
  routesByFilePath: ReadonlyMap<string, BuiltRoute>,
  menuIdMap: Map<string, string>,
  isSSR: boolean,
  indent: string,
  routeName: string,
  triePath: string,
  routeNamesByTriePath: ReadonlyMap<string, string>,
  loadersByFile?: Map<string, string[]>,
  routeLoaderSourceFiles?: RouteLoaderSourceFiles
): string {
  const lines: string[] = [];
  const nextIndent = indent + '  ';

  // _P, _0, _9 from node properties
  if (node._P) {
    lines.push(`${nextIndent}_P: ${JSON.stringify(node._P)},`);
  }
  if (node._0) {
    lines.push(`${nextIndent}_0: ${JSON.stringify(node._0)},`);
  }
  if (node._9) {
    lines.push(`${nextIndent}_9: ${JSON.stringify(node._9)},`);
  }

  // _G rewrite target
  if (node._G != null) {
    const target = toRuntimeTriePath(node._G, ctx.opts.basePathname);
    lines.push(`${nextIndent}_G: ${JSON.stringify(target)},`);
  }

  // Process _files at this node
  let layoutExpr: string | undefined;
  let layoutFile: RouteSourceFile | undefined;
  let indexExpr: string | undefined;
  let errorExpr: string | undefined;
  let notFoundExpr: string | undefined;
  let menuExpr: string | undefined;
  let bundleRoute: BuiltRoute | undefined;
  let pageLayouts: BuiltRoute['layouts'] | undefined;

  for (const file of node._files) {
    if (file.type === 'menu') {
      const menuId = menuIdMap.get(file.filePath);
      if (menuId) {
        menuExpr = menuId;
      }
    } else if (file.type === 'layout') {
      const layoutId = layoutIdMap.get(file.filePath);
      if (layoutId) {
        if (file.extlessName === 'layout' || file.extlessName === 'layout!') {
          layoutExpr = layoutId;
          layoutFile = file;
        }
      }
    }
  }

  // Collect pages and boundaries.
  for (const file of node._files) {
    if (file.type !== 'route') {
      continue;
    }
    const loaderExpr = routeIdMap.get(file.filePath);
    if (!loaderExpr) {
      continue;
    }

    const route = routesByFilePath.get(file.filePath);
    const expr = buildLoaderChainExpr(file.extlessName, loaderExpr, route?.layouts ?? []);

    // error.tsx / 404.tsx (+ optional layout modifier) are boundaries, not navigable pages.
    const boundary = caughtErrorName(file.extlessName);
    if (boundary === '404') {
      notFoundExpr = expr;
    } else if (boundary === 'error') {
      errorExpr = expr;
    } else {
      indexExpr = expr;
      const { layoutName, layoutStop } = parseRouteIndexName(file.extlessName);
      pageLayouts = layoutStop || layoutName ? (route?.layouts ?? []) : undefined;
      bundleRoute = route;
    }
  }

  // Emit _L (single layout loader for this node)
  if (layoutExpr) {
    lines.push(`${nextIndent}_L: ${layoutExpr},`);
  }

  if (indexExpr || node._G != null || layoutFile) {
    const canonicalName =
      bundleRoute?.routeName ??
      (layoutFile
        ? getPathnameFromDirPath(ctx.opts, layoutFile.dirPath)
        : routeNamesByTriePath.get(triePath));
    const canonicalParts = canonicalName?.split('/').filter(Boolean);
    if (canonicalParts && canonicalParts.join('/') !== routeName) {
      lines.push(`${nextIndent}_C: ${JSON.stringify(canonicalParts)},`);
    }
  }

  // Emit _I (index/page loader)
  if (indexExpr) {
    lines.push(`${nextIndent}_I: ${indexExpr},`);

    // Emit _B bundle names (SSR only)
    if (isSSR && bundleRoute) {
      const bundleNames = getClientRouteBundleNames(qwikPlugin, bundleRoute);
      if (bundleNames.length > 0) {
        lines.push(`${nextIndent}_B: ${JSON.stringify(bundleNames)},`);
      }
    }
  }

  // Layout and plugin loaders are inherited; page loaders are not.
  const pluginFiles = ctx.serverPlugins.map((plugin) => plugin.filePath);
  const layoutFiles = node._files
    .filter((file) => file.type === 'layout' && !file.extlessName.startsWith('layout-'))
    .map((file) => file.filePath);
  if (node === ctx.routeTrie) {
    layoutFiles.push(...pluginFiles);
  }
  const pageFiles = bundleRoute ? [bundleRoute.filePath] : [];
  if (pageLayouts) {
    pageFiles.push(...pageLayouts.map((layout) => layout.filePath), ...pluginFiles);
  }
  for (const [field, routeFiles] of [
    ['_R', layoutFiles],
    ['_D', pageFiles],
  ] as const) {
    const routeLoaderFiles = [
      ...new Set(
        routeFiles.flatMap((path) => [path, ...(routeLoaderSourceFiles?.get(path) ?? [])])
      ),
    ];
    if (routeLoaderFiles.length === 0) {
      continue;
    }
    if (loadersByFile) {
      const hashes = routeLoaderFiles.flatMap(
        (filePath) => loadersByFile.get(normalizePathKey(filePath)) ?? []
      );
      if (hashes.length > 0) {
        lines.push(`${nextIndent}${field}: ${JSON.stringify(hashes)},`);
      }
    } else {
      const placeholder = `__LOADERS:${routeLoaderFiles.join('|')}__`;
      lines.push(`${nextIndent}${field}: ${JSON.stringify(placeholder)},`);
    }
  }

  // Emit _E, _4, _N
  if (errorExpr) {
    lines.push(`${nextIndent}_E: ${errorExpr},`);
  }
  if (notFoundExpr) {
    lines.push(`${nextIndent}_4: ${notFoundExpr},`);
  }
  if (menuExpr) {
    lines.push(`${nextIndent}_N: ${menuExpr},`);
  }

  // Separate children into groups and regular children
  const groupChildren: [string, BuildTrieNode][] = [];
  const regularChildren: [string, BuildTrieNode][] = [];

  for (const [key, child] of node.children) {
    if (isGroupKey(key)) {
      groupChildren.push([key, child]);
    } else {
      regularChildren.push([key, child]);
    }
  }

  // Serialize group children as _M array (sorted by group name), skipping empty nodes
  if (groupChildren.length > 0) {
    groupChildren.sort((a, b) => a[0].localeCompare(b[0]));
    const groupStrs: string[] = [];
    for (const [_key, child] of groupChildren) {
      const childStr = serializeBuildTrie(
        ctx,
        qwikPlugin,
        child,
        layoutIdMap,
        routeIdMap,
        routesByFilePath,
        menuIdMap,
        isSSR,
        nextIndent,
        routeName,
        triePath,
        routeNamesByTriePath,
        loadersByFile,
        routeLoaderSourceFiles
      );
      if (childStr !== '{}') {
        groupStrs.push(childStr);
      }
    }
    if (groupStrs.length > 0) {
      lines.push(`${nextIndent}_M: [${groupStrs.join(', ')}],`);
    }
  }

  // Serialize regular children, skipping empty nodes
  for (const [key, child] of regularChildren) {
    const segment = child._P
      ? `${child._0 ?? ''}[${key === '_A' ? '...' : ''}${child._P}]${child._9 ?? ''}`
      : (child._S ?? key);
    const childRouteName = routeName ? `${routeName}/${segment}` : segment;
    const childStr = serializeBuildTrie(
      ctx,
      qwikPlugin,
      child,
      layoutIdMap,
      routeIdMap,
      routesByFilePath,
      menuIdMap,
      isSSR,
      nextIndent,
      childRouteName,
      triePath ? `${triePath}/${getRouteTriePath(segment)}` : getRouteTriePath(segment),
      routeNamesByTriePath,
      loadersByFile,
      routeLoaderSourceFiles
    );
    if (childStr !== '{}') {
      const keyStr = JSON.stringify(toRuntimeTrieKey(key));
      lines.push(`${nextIndent}${keyStr}: ${childStr},`);
    }
  }

  if (lines.length === 0) {
    return '{}';
  }
  if (node._S) {
    lines.unshift(`${nextIndent}_S: ${JSON.stringify(node._S)},`);
  }
  return `{\n${lines.join('\n')}\n${indent}}`;
}

/**
 * The `_I`/`_E`/`_4` loader expression: a bare loader (runtime prepends gathered layouts), or an
 * override chain for `!` (layout stop) / `@name` (named layout).
 */
function buildLoaderChainExpr(
  extlessName: string,
  loaderExpr: string,
  layouts: BuiltRoute['layouts']
): string {
  const { layoutName, layoutStop } = parseRouteIndexName(extlessName);
  if (layoutStop || layoutName) {
    return `[ ${[...layouts.map((layout) => layout.id), loaderExpr].join(', ')} ]`;
  }
  return loaderExpr;
}

function getClientRouteBundleNames(qwikPlugin: QwikVitePlugin, r: BuiltRoute) {
  const bundlesNames: string[] = [];

  const manifest: QwikManifest = qwikPlugin.api.getManifest()!;
  if (manifest) {
    const manifestBundleNames = Object.keys(manifest.bundles);

    const addRouteFile = (filePath: string) => {
      filePath = removeExtension(filePath);

      for (const bundleName of manifestBundleNames) {
        const bundle = manifest.bundles[bundleName];
        if (bundle.origins) {
          for (const bundleOrigin of bundle.origins) {
            const originPath = removeExtension(bundleOrigin);
            if (filePath.endsWith(originPath)) {
              if (!bundlesNames.includes(bundleName)) {
                bundlesNames.push(bundleName);
              }
            }
          }
        }
      }
    };

    for (const layout of r.layouts) {
      addRouteFile(layout.filePath);
    }
    addRouteFile(r.filePath);
  }

  return bundlesNames;
}

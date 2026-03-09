import type { QwikManifest, QwikVitePlugin } from '@qwik.dev/core/optimizer';
import {
  createFileId,
  isModuleExt,
  isPageExt,
  removeExtension,
  parseRouteIndexName,
} from '../../utils/fs';
import type { BuildTrieNode, BuiltRoute, RoutingContext, RouteSourceFile } from '../types';
import { getImportPath } from './utils';

/** Info about a layout at a trie level, used for ancestor stack during codegen */
interface LayoutInfo {
  id: string;
  layoutName: string;
  layoutType: 'top' | 'nested';
}

/** Check if a build trie key is a group directory name like `(common)` */
function isGroupKey(key: string) {
  return key.charCodeAt(0) === 40 /* '(' */;
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
  isSSR: boolean
) {
  const includeEndpoints = isSSR;
  const dynamicImports = ctx.dynamicImports;

  // First pass: collect all layout, route, and menu file IDs, emit imports
  const layoutIdMap = new Map<string, string>(); // filePath → varName
  const routeIdMap = new Map<string, string>(); // filePath → loader expression
  const menuIdMap = new Map<string, string>(); // filePath → varName

  // Track error/404 files per trie path for precedence warnings
  const errorFiles = new Map<string, string>();
  const notFoundFiles = new Map<string, string>();

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
      const route = ctx.routes.find((r) => r.filePath === file.filePath);
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
    if (isPageExt(route.ext)) {
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

  // Serialize the trie
  const trieStr = serializeBuildTrie(
    ctx,
    qwikPlugin,
    ctx.routeTrie,
    layoutIdMap,
    routeIdMap,
    menuIdMap,
    errorFiles,
    notFoundFiles,
    [],
    isSSR,
    ''
  );

  // Emit warnings for directories that have both error.tsx and 404.tsx
  for (const [dirKey, errorFile] of errorFiles) {
    if (notFoundFiles.has(dirKey)) {
      console.warn(
        `Warning: Both error.tsx and 404.tsx found in "${dirKey || '/'}". ` +
          `error.tsx (${errorFile}) takes precedence; 404.tsx will be ignored.`
      );
    }
  }

  // Wrap the trie in the base pathname segments (e.g., '/qwikrouter-test/' → 'qwikrouter-test')
  // The runtime matcher receives the full URL pathname, so the trie must include the base prefix.
  const baseSegments = ctx.opts.basePathname.split('/').filter((s) => s.length > 0);
  let routesExpr = trieStr;
  for (let j = baseSegments.length - 1; j >= 0; j--) {
    routesExpr = `{ ${JSON.stringify(baseSegments[j])}: ${routesExpr} }`;
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

/**
 * Serialize a BuildTrieNode to a JS object literal string.
 *
 * The ancestor stack tracks layouts from parent nodes for layout chain resolution (needed for
 * layout stops and named layouts).
 */
function serializeBuildTrie(
  ctx: RoutingContext,
  qwikPlugin: QwikVitePlugin,
  node: BuildTrieNode,
  layoutIdMap: Map<string, string>,
  routeIdMap: Map<string, string>,
  menuIdMap: Map<string, string>,
  errorFiles: Map<string, string>,
  notFoundFiles: Map<string, string>,
  ancestorLayouts: LayoutInfo[],
  isSSR: boolean,
  indent: string
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
  if (node._G) {
    lines.push(`${nextIndent}_G: ${JSON.stringify(node._G)},`);
  }

  // Process _files at this node
  let layoutExpr: string | undefined;
  let indexExpr: string | undefined;
  let indexIsOverride = false;
  let errorExpr: string | undefined;
  let notFoundExpr: string | undefined;
  let menuExpr: string | undefined;
  let bundleRoute: BuiltRoute | undefined;

  // Collect layout info for this node
  const nodeLayouts: LayoutInfo[] = [];

  for (const file of node._files) {
    if (file.type === 'menu') {
      const menuId = menuIdMap.get(file.filePath);
      if (menuId) {
        menuExpr = menuId;
      }
    } else if (file.type === 'layout') {
      const layoutId = layoutIdMap.get(file.filePath);
      if (layoutId) {
        layoutExpr = layoutId;

        // Determine layout name and type for ancestor tracking
        let extlessName = file.extlessName;
        let layoutType: 'top' | 'nested' = 'nested';
        if (extlessName.endsWith('!')) {
          layoutType = 'top';
          extlessName = extlessName.slice(0, -1);
        }
        const layoutName = extlessName.startsWith('layout-')
          ? extlessName.slice('layout-'.length)
          : '';

        nodeLayouts.push({ id: layoutId, layoutName, layoutType });
      }
    } else if (file.type === 'route') {
      const loaderExpr = routeIdMap.get(file.filePath);
      if (!loaderExpr) {
        continue;
      }

      // Check if this is error.tsx or 404.tsx
      const isError = file.extlessName === 'error';
      const is404 = file.extlessName === '404';

      if (isError) {
        errorExpr = loaderExpr;
        errorFiles.set(node._dirPath, file.filePath);
      } else if (is404) {
        notFoundExpr = loaderExpr;
        notFoundFiles.set(node._dirPath, file.filePath);
      } else {
        // Normal route or endpoint — check for layout stop / named layout
        const { layoutName, layoutStop } = parseRouteIndexName(file.extlessName);

        if (layoutStop) {
          // Layout stop: emit _I as array with just the page loader (no layouts)
          indexExpr = `[ ${loaderExpr} ]`;
          indexIsOverride = true;
        } else if (layoutName) {
          // Named layout: walk up ancestors to build the override chain
          const chain = resolveNamedLayoutChain(ancestorLayouts, nodeLayouts, layoutName);
          const chainExprs = chain.map((l) => l.id);
          chainExprs.push(loaderExpr);
          indexExpr = `[ ${chainExprs.join(', ')} ]`;
          indexIsOverride = true;
        } else {
          // Normal route: single loader, runtime prepends _L
          indexExpr = loaderExpr;
        }

        // Find the BuiltRoute for bundle names
        bundleRoute = ctx.routes.find((r) => r.filePath === file.filePath);
      }
    }
  }

  // Emit _L (single layout loader for this node)
  if (layoutExpr) {
    lines.push(`${nextIndent}_L: ${layoutExpr},`);
  }

  // Emit _I (index/page loader)
  if (indexExpr) {
    if (indexIsOverride) {
      lines.push(`${nextIndent}_I: ${indexExpr},`);
    } else {
      lines.push(`${nextIndent}_I: ${indexExpr},`);
    }

    // Emit _B bundle names (SSR only)
    if (isSSR && bundleRoute) {
      const bundleNames = getClientRouteBundleNames(qwikPlugin, bundleRoute);
      if (bundleNames.length > 0) {
        lines.push(`${nextIndent}_B: ${JSON.stringify(bundleNames)},`);
      }
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

  // Build ancestor stack for children: include this node's layouts
  const childAncestors = [...ancestorLayouts, ...nodeLayouts];

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

  // Serialize group children as _M array (sorted by group name)
  if (groupChildren.length > 0) {
    groupChildren.sort((a, b) => a[0].localeCompare(b[0]));
    const groupStrs = groupChildren.map(([_key, child]) => {
      return serializeBuildTrie(
        ctx,
        qwikPlugin,
        child,
        layoutIdMap,
        routeIdMap,
        menuIdMap,
        errorFiles,
        notFoundFiles,
        childAncestors,
        isSSR,
        nextIndent
      );
    });
    lines.push(`${nextIndent}_M: [${groupStrs.join(', ')}],`);
  }

  // Serialize regular children
  for (const [key, child] of regularChildren) {
    const keyStr = JSON.stringify(key);
    const childStr = serializeBuildTrie(
      ctx,
      qwikPlugin,
      child,
      layoutIdMap,
      routeIdMap,
      menuIdMap,
      errorFiles,
      notFoundFiles,
      childAncestors,
      isSSR,
      nextIndent
    );
    lines.push(`${nextIndent}${keyStr}: ${childStr},`);
  }

  if (lines.length === 0) {
    return '{}';
  }
  return `{\n${lines.join('\n')}\n${indent}}`;
}

/**
 * For a named layout `index@name.tsx`, walk up ancestors to find the named layout and collect
 * default layouts above it.
 *
 * Returns the layout chain in order: [outermost default..., named layout]
 */
function resolveNamedLayoutChain(
  ancestorLayouts: LayoutInfo[],
  nodeLayouts: LayoutInfo[],
  targetName: string
): LayoutInfo[] {
  const allLayouts = [...ancestorLayouts, ...nodeLayouts];
  const result: LayoutInfo[] = [];
  let foundNamed = false;

  // Walk from innermost to outermost
  for (let i = allLayouts.length - 1; i >= 0; i--) {
    const layout = allLayouts[i];

    if (!foundNamed) {
      if (layout.layoutName === targetName) {
        result.unshift(layout);
        foundNamed = true;
      }
    } else {
      // After finding named, collect default layouts
      if (layout.layoutName === '') {
        result.unshift(layout);
        if (layout.layoutType === 'top') {
          break;
        }
      }
    }
  }

  return result;
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

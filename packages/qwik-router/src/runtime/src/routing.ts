import type { ValueOrPromise } from '@qwik.dev/core';
import { MODULE_CACHE } from './constants';
import { deepFreeze } from './deepFreeze';
import {
  type ContentMenu,
  type LoadedRoute,
  type MenuModule,
  type MenuModuleLoader,
  type ModuleLoader,
  type PathParams,
  type RouteData,
  type RouteModule,
} from './types';

/** LoadRoute() runs in both client and server. */
export const loadRoute = async (
  routes: RouteData | undefined,
  cacheModules: boolean | undefined,
  pathname: string,
  isInternal?: boolean
): Promise<LoadedRoute> => {
  const result = matchRouteTree(routes, pathname);

  const { loaders, params, routeParts, notFound, routeBundleNames, menuLoader } = result;

  const routeName = '/' + routeParts.join('/');

  const modules: RouteModule[] = new Array(loaders.length);
  const pendingLoads: Promise<any>[] = [];

  loaders.forEach((moduleLoader, i) => {
    loadModule<RouteModule>(
      moduleLoader,
      pendingLoads,
      (routeModule) => (modules[i] = routeModule),
      cacheModules
    );
  });

  let menu: ContentMenu | undefined = undefined;
  // No need to load menu for internal QData requests
  if (!isInternal) {
    loadModule<MenuModule>(
      menuLoader,
      pendingLoads,
      (menuModule) => (menu = menuModule?.default),
      cacheModules
    );
  }
  if (pendingLoads.length > 0) {
    await Promise.all(pendingLoads);
  }

  return [routeName, params, modules, deepFreeze(menu), routeBundleNames, notFound];
};

/** Built-in fallback error component loader */
const httpErrorLoader: ModuleLoader = () => import('./http-error');

/**
 * Walk trie keys from root, gathering `_L` layouts along the way. Returns the final node and
 * collected layouts, or undefined if any key is missing.
 */
function walkTrieKeys(
  root: RouteData,
  keys: string[]
): { node: RouteData; layouts: ModuleLoader[] } | undefined {
  let node = root;
  const layouts: ModuleLoader[] = [];
  if (node._L) {
    layouts.push(node._L);
  }
  for (const key of keys) {
    const next = node[key] as RouteData | undefined;
    if (!next) {
      return undefined;
    }
    node = next;
    if (node._L) {
      layouts.push(node._L);
    }
  }
  return { node, layouts };
}

/**
 * Given a matched node that has `_I` or `_G`, resolve the final loaders array.
 *
 * - `_G`: re-walk from root to gather target's layouts and `_I`
 * - `_I` array: use as-is (override, e.g. layout stop)
 * - `_I` function: prepend gathered layouts
 */
function resolveLoaders(
  root: RouteData,
  node: RouteData,
  gatheredLayouts: ModuleLoader[]
): ModuleLoader[] | undefined {
  if (node._G) {
    // Rewrite: re-walk from root using _G's keys
    const keys = (node._G as string).split('/').filter((p) => p.length > 0);
    const target = walkTrieKeys(root, keys);
    if (!target) {
      return undefined;
    }
    // Recursively resolve the target (it could also have _G, though unlikely)
    return resolveLoaders(root, target.node, target.layouts);
  }

  const index = node._I;
  if (!index) {
    return undefined;
  }

  if (Array.isArray(index)) {
    // Override: the array IS the complete loader chain
    return index;
  }

  // Single loader: prepend gathered layouts
  return [...gatheredLayouts, index];
}

/**
 * Collect layouts and error loaders from a node and any group ancestors between the parent and this
 * node. `groups` is the chain of group nodes entered to reach `node`.
 */
function collectNodeMeta(
  node: RouteData,
  groups: RouteData[],
  layouts: ModuleLoader[],
  errorLoaderRef: { v: ModuleLoader | undefined },
  menuLoaderRef: { v: MenuModuleLoader | undefined }
) {
  for (const g of groups) {
    if (g._L) {
      layouts.push(g._L);
    }
    if (g._E) {
      errorLoaderRef.v = g._E;
    } else if (g._4) {
      errorLoaderRef.v = g._4;
    }
    if (g._N) {
      menuLoaderRef.v = g._N;
    }
  }
  if (node._L) {
    layouts.push(node._L);
  }
  if (node._E) {
    errorLoaderRef.v = node._E;
  } else if (node._4) {
    errorLoaderRef.v = node._4;
  }
  if (node._N) {
    menuLoaderRef.v = node._N;
  }
}

/**
 * Try to find a child matching `partLower` in `node`, including inside group children (_M). Returns
 * the matched child node, the groups entered to reach it, and what to push to routeParts. Returns
 * undefined if no match.
 */
function findChild(
  node: RouteData,
  part: string,
  partLower: string,
  parts: string[],
  partIndex: number,
  params: PathParams
): { next: RouteData; groups: RouteData[]; routePart: string; done: boolean } | undefined {
  // Try matching in this node's direct children
  const result = tryMatch(node, part, partLower, parts, partIndex, params);
  if (result) {
    return { ...result, groups: [] };
  }

  // Try matching inside group children (_M array)
  if (node._M) {
    for (const group of node._M) {
      const groupResult = findChild(group, part, partLower, parts, partIndex, params);
      if (groupResult) {
        // Prepend this group to the groups chain
        groupResult.groups.unshift(group);
        return groupResult;
      }
    }
  }

  return undefined;
}

/** Try to match a segment against a node's non-group children (exact, _W, _A). */
function tryMatch(
  node: RouteData,
  part: string,
  partLower: string,
  parts: string[],
  partIndex: number,
  params: PathParams
): { next: RouteData; routePart: string; done: boolean } | undefined {
  // Exact match
  let next = node[partLower] as RouteData | undefined;
  if (next) {
    return { next, routePart: part, done: false };
  }

  // Wildcard [param]
  next = node._W as RouteData | undefined;
  if (next) {
    const prefix = next._0;
    const suffix = next._9;
    if (prefix || suffix) {
      const pre = prefix || '';
      const suf = suffix || '';
      if (
        partLower.length > pre.length + suf.length &&
        (!pre || partLower.startsWith(pre.toLowerCase())) &&
        (!suf || partLower.endsWith(suf.toLowerCase()))
      ) {
        const paramName = next._P!;
        const value = part.slice(pre.length, suf ? part.length - suf.length : undefined);
        params[paramName] = value;
        return { next, routePart: `${pre}[${paramName}]${suf}`, done: false };
      }
    } else {
      const paramName = next._P!;
      params[paramName] = part;
      return { next, routePart: `[${paramName}]`, done: false };
    }
  }

  // Rest wildcard [...param]
  next = node._A as RouteData | undefined;
  if (next) {
    const paramName = next._P!;
    const restValue = parts.slice(partIndex).join('/');
    params[paramName] = restValue;
    return { next, routePart: `[...${paramName}]`, done: true };
  }

  return undefined;
}

/**
 * Find a node with `_I` at the current level, including inside group children (_M). Returns the
 * node and the groups entered to reach it.
 */
function findIndexNode(node: RouteData): { target: RouteData; groups: RouteData[] } | undefined {
  if (node._I || node._G) {
    return { target: node, groups: [] };
  }
  if (node._M) {
    for (const group of node._M) {
      const result = findIndexNode(group);
      if (result) {
        // Only add the group to the chain if it's not already the target
        // (otherwise collectNodeMeta would add its layout twice)
        if (result.target !== group) {
          result.groups.unshift(group);
        }
        return result;
      }
    }
  }
  return undefined;
}

/**
 * Match a URL pathname against the route trie.
 *
 * Always returns a result. When no route matches, `notFound` is true and `loaders` contains only
 * the error component (from the nearest `_E` or `_4` ancestor, or the built-in fallback).
 *
 * Group nodes (in `_M` arrays) are pathless — they don't consume a URL segment but contribute their
 * `_L` layout to the chain. The matcher transparently enters groups when searching for a matching
 * child.
 */
function matchRouteTree(
  root: RouteData = {},
  pathname: string
): {
  loaders: ModuleLoader[];
  params: PathParams;
  routeParts: string[];
  notFound: boolean;
  routeBundleNames: string[] | undefined;
  menuLoader: MenuModuleLoader | undefined;
} {
  let node: RouteData = root;
  const params: PathParams = {};
  const routeParts: string[] = [];
  const layouts: ModuleLoader[] = [];
  const errorLoaderRef: { v: ModuleLoader | undefined } = { v: undefined };
  const menuLoaderRef: { v: MenuModuleLoader | undefined } = { v: undefined };

  // Collect root layout, error loader, and menu loader
  if (root._L) {
    layouts.push(root._L);
  }
  if (root._E) {
    errorLoaderRef.v = root._E;
  } else if (root._4) {
    errorLoaderRef.v = root._4;
  }
  if (root._N) {
    menuLoaderRef.v = root._N;
  }

  let done = false;
  let matched = true;
  const parts = pathname
    .split('/')
    .filter((p) => p.length > 0)
    .map(decodeURIComponent);
  let i = 0;
  const len = parts.length;
  for (; !done && i < len; i++) {
    const part = parts[i];
    const partLower = part.toLowerCase();

    const found = findChild(node, part, partLower, parts, i, params);
    if (!found) {
      matched = false;
      break;
    }

    routeParts.push(found.routePart);
    done = found.done;
    node = found.next;
    collectNodeMeta(node, found.groups, layouts, errorLoaderRef, menuLoaderRef);
  }

  // If we consumed all parts but the current node has no _I,
  // check for rest wildcard (_A) or group children with _I
  if (matched && !done && i === len) {
    // First check for _A (rest wildcard with empty value)
    if (!node._I && node._A) {
      const next = node._A as RouteData;
      const paramName = next._P!;
      params[paramName as string] = '';
      routeParts.push(`[...${paramName}]`);
      node = next;
      if (node._L) {
        layouts.push(node._L);
      }
      if (node._N) {
        menuLoaderRef.v = node._N;
      }
    }

    // Check if _I is in a group child (e.g. (common)/index.tsx is the root "/" route)
    if (!node._I && !node._G) {
      const indexResult = findIndexNode(node);
      if (indexResult) {
        collectNodeMeta(
          indexResult.target,
          indexResult.groups,
          layouts,
          errorLoaderRef,
          menuLoaderRef
        );
        node = indexResult.target;
      }
    }
  }

  // Resolve loaders from _I or _G
  const loaders = matched && (done || i >= len) ? resolveLoaders(root, node, layouts) : undefined;

  if (!loaders) {
    const loader = errorLoaderRef.v || httpErrorLoader;
    return {
      loaders: [loader],
      params,
      routeParts,
      notFound: true,
      routeBundleNames: undefined,
      menuLoader: menuLoaderRef.v,
    };
  }

  return {
    loaders,
    params,
    routeParts,
    notFound: false,
    routeBundleNames: node._B as string[] | undefined,
    menuLoader: menuLoaderRef.v,
  };
}

const loadModule = <T>(
  moduleLoader: (() => ValueOrPromise<T>) | undefined,
  pendingLoads: Promise<any>[],
  moduleSetter: (loadedModule: T) => void,
  cacheModules: boolean | undefined
) => {
  if (typeof moduleLoader === 'function') {
    const loadedModule = MODULE_CACHE.get(moduleLoader);
    if (loadedModule) {
      moduleSetter(loadedModule);
    } else {
      const moduleOrPromise: any = moduleLoader();
      if (typeof moduleOrPromise.then === 'function') {
        pendingLoads.push(
          moduleOrPromise.then((loadedModule: any) => {
            if (cacheModules !== false) {
              MODULE_CACHE.set(moduleLoader, loadedModule);
            }
            moduleSetter(loadedModule);
          })
        );
      } else if (moduleOrPromise) {
        moduleSetter(moduleOrPromise);
      }
    }
  }
};

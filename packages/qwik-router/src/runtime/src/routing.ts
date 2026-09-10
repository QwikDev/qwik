import type { ValueOrPromise } from '@qwik.dev/core';
import { ensureSlash } from '../../utils/pathname';
import { deepFreeze } from './deepFreeze';
import {
  type ContentMenu,
  type ContentModuleLoader,
  type LoadedRoute,
  type MenuModule,
  type MenuModuleLoader,
  type ModuleLoader,
  type PathParams,
  type RouteData,
  type RouteModule,
} from './types';

/** LoadRoute() runs in both client and server. */
const MODULE_CACHE = /*#__PURE__*/ new WeakMap<any, any>();

export const loadRoute = async (
  routes: RouteData | undefined,
  cacheModules: boolean | undefined,
  pathname: string
): Promise<LoadedRoute> => {
  const result = matchRouteTree(routes, pathname);

  const {
    loaders,
    params,
    routeParts,
    notFound,
    routeBundleNames,
    loaderHashes,
    loaderPathsByHash,
    menuLoader,
    errorLoader,
  } = result;

  const routeName = '/' + routeParts.join('/');

  const modules: RouteModule[] = new Array(loaders.length);
  const pendingLoads: Promise<any>[] = [];

  for (let i = 0; i < loaders.length; i++) {
    const moduleLoader = loaders[i];
    loadModule<RouteModule>(
      moduleLoader,
      pendingLoads,
      (routeModule) => (modules[i] = routeModule),
      cacheModules
    );
  }

  let menu: ContentMenu | undefined = undefined;
  loadModule<MenuModule>(
    menuLoader,
    pendingLoads,
    (menuModule) => (menu = menuModule?.default),
    cacheModules
  );

  if (pendingLoads.length > 0) {
    await Promise.all(pendingLoads);
  }

  return {
    $routeName$: routeName,
    $params$: params,
    $mods$: modules,
    $menu$: deepFreeze(menu),
    $routeBundleNames$: routeBundleNames,
    $notFound$: notFound,
    $errorLoader$: errorLoader,
    $loaders$: loaderHashes,
    $loaderPaths$: loaderPathsByHash,
  };
};

/** Built-in fallback error component loader */
const httpErrorLoader = (() => import('./http-error')) as ContentModuleLoader;

/** Collect the rewrite target's layouts and loader endpoint paths. */
function walkTrieKeys(
  root: RouteData,
  keys: string[],
  params: PathParams
): { node: RouteData; layouts: ModuleLoader[]; loaderPaths: Record<string, string> } | undefined {
  let node = root;
  let pathname = '/';
  const layouts: ModuleLoader[] = [];
  const loaderPaths: Record<string, string> = {};
  const collect = (node: RouteData) => {
    if (node._L) {
      layouts.push(node._L);
    }
    for (const hash of node._R ?? []) {
      loaderPaths[hash] = pathname;
    }
  };
  collect(root);
  for (const key of keys) {
    const match = descendGroups(node, (candidate) => candidate[key] as RouteData | undefined);
    if (!match) {
      return undefined;
    }
    for (const group of match.groups) {
      collect(group);
    }
    node = match.value;
    const segment = node._P ? `${node._0 ?? ''}${params[node._P] ?? ''}${node._9 ?? ''}` : key;
    const segments = key === '_A' ? segment.split('/') : [segment];
    pathname = ensureSlash(pathname + segments.map(encodeURIComponent).join('/'));
    collect(node);
  }
  if (!node._I && node._G == null) {
    const index = findIndexNode(node);
    if (index) {
      for (const group of index.groups) {
        collect(group);
      }
      node = index.target;
      collect(node);
    }
  }
  return { node, layouts, loaderPaths };
}

type ResolvedIndex = {
  loaders: ModuleLoader[];
  node: RouteData;
  loaderPaths?: Record<string, string>;
};

/** Resolve the page and its modules, following rewrite targets. */
function resolveLoaders(
  root: RouteData,
  node: RouteData,
  gatheredLayouts: ModuleLoader[],
  params: PathParams
): ResolvedIndex | undefined {
  if (node._G != null) {
    // Rewrite: re-walk from root using _G's keys
    const keys = (node._G as string).split('/').filter((p) => p.length > 0);
    const target = walkTrieKeys(root, keys, params);
    if (!target) {
      return undefined;
    }
    const resolved = resolveLoaders(root, target.node, target.layouts, params);
    if (resolved) {
      resolved.loaderPaths ??= target.loaderPaths;
    }
    return resolved;
  }

  const index = node._I;
  if (!index) {
    return undefined;
  }

  if (Array.isArray(index)) {
    // Override: the array IS the complete loader chain
    return { loaders: index, node };
  }

  // Single loader: prepend gathered layouts
  return { loaders: [...gatheredLayouts, index], node };
}

/**
 * A captured error/404 boundary: its loader (a single loader, or an override layout chain) plus a
 * snapshot of the ambient layouts where it was found. A bare boundary renders in its OWN layouts —
 * not in deeper ones gathered while walking past it to the dead end.
 */
type BoundaryRef = { v: ContentModuleLoader | ModuleLoader[] | undefined; layouts: ModuleLoader[] };

/**
 * The full chain to render for a boundary: a bare loader in its snapshot layouts, an override
 * as-is.
 */
const boundaryChain = (ref: BoundaryRef): ModuleLoader[] | undefined =>
  ref.v ? (Array.isArray(ref.v) ? ref.v : [...ref.layouts, ref.v]) : undefined;

/**
 * Collect layouts, the nearest error (`_E`) and not-found (`_4`) boundaries, and the menu from a
 * node and the group ancestors entered to reach it.
 */
function collectNodeMeta(
  node: RouteData,
  groups: RouteData[],
  layouts: ModuleLoader[],
  errorLoaderRef: BoundaryRef,
  notFoundLoaderRef: BoundaryRef,
  menuLoaderRef: { v: MenuModuleLoader | undefined },
  loaderHashes?: string[],
  loaderPathsByHash?: Record<string, string>,
  matchedPathname = '/'
) {
  for (let j = 0; j < groups.length; j++) {
    const g = groups[j];
    if (g._L) {
      layouts.push(g._L);
    }
    if (g._R && loaderHashes) {
      loaderHashes.push(...g._R);
      if (loaderPathsByHash) {
        for (let i = 0; i < g._R.length; i++) {
          const hash = g._R[i];
          loaderPathsByHash[hash] = matchedPathname;
        }
      }
    }
    if (g._E) {
      errorLoaderRef.v = g._E;
      errorLoaderRef.layouts = [...layouts];
    }
    if (g._4) {
      notFoundLoaderRef.v = g._4;
      notFoundLoaderRef.layouts = [...layouts];
    }
    if (g._N) {
      menuLoaderRef.v = g._N;
    }
  }
  if (node._L) {
    layouts.push(node._L);
  }
  if (node._R && loaderHashes) {
    loaderHashes.push(...node._R);
    if (loaderPathsByHash) {
      for (let i = 0; i < node._R.length; i++) {
        const hash = node._R[i];
        loaderPathsByHash[hash] = matchedPathname;
      }
    }
  }
  if (node._E) {
    errorLoaderRef.v = node._E;
    errorLoaderRef.layouts = [...layouts];
  }
  if (node._4) {
    notFoundLoaderRef.v = node._4;
    notFoundLoaderRef.layouts = [...layouts];
  }
  if (node._N) {
    menuLoaderRef.v = node._N;
  }
}

enum ChildMatchKind {
  Exact,
  Wildcard,
  Rest,
}

interface ChildMatch {
  next: RouteData;
  groups: RouteData[];
  routePart: string;
  done: boolean;
  kind: ChildMatchKind;
  paramName?: string;
  paramValue?: string;
}

/**
 * Try to find a child matching `partLower` in `node`, including inside group children (_M). Returns
 * the matched child node, the groups entered to reach it, what to push to routeParts, and which
 * kind of edge matched. Returns undefined if no match.
 *
 * Priority: exact match → _M groups (recursively) → _W wildcard → _A rest wildcard. This ensures
 * exact matches inside nested groups take precedence over wildcards at parent level.
 */
function findChild(
  node: RouteData,
  part: string,
  partLower: string,
  parts: string[],
  partIndex: number
): ChildMatch | undefined {
  // 1. Try exact match on this node's direct children
  const exact = node[partLower] as RouteData | undefined;
  if (exact) {
    return {
      next: exact,
      groups: [],
      routePart: part,
      done: false,
      kind: ChildMatchKind.Exact,
    };
  }

  // 2. Try matching inside group children (_M array).
  //    Groups can have their own exact matches and wildcards, so check them
  //    before this node's wildcards.
  if (node._M) {
    for (let j = 0; j < node._M.length; j++) {
      const group = node._M[j];
      const groupResult = findChild(group, part, partLower, parts, partIndex);
      if (groupResult) {
        // Prepend this group to the groups chain
        groupResult.groups.unshift(group);
        return groupResult;
      }
    }
  }

  // 3. Try wildcard [param] on this node
  const wildcard = tryWildcardMatch(node, part, partLower, parts, partIndex);
  if (wildcard) {
    return { ...wildcard, groups: [] };
  }

  return undefined;
}

/** Try to match a segment against a node's wildcard children (_W, _A). */
function tryWildcardMatch(
  node: RouteData,
  part: string,
  partLower: string,
  parts: string[],
  partIndex: number
): Omit<ChildMatch, 'groups'> | undefined {
  // Wildcard [param]
  let next = node._W as RouteData | undefined;
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
        return {
          next,
          routePart: `${pre}[${paramName}]${suf}`,
          done: false,
          kind: ChildMatchKind.Wildcard,
          paramName,
          paramValue: value,
        };
      }
    } else {
      const paramName = next._P!;
      return {
        next,
        routePart: `[${paramName}]`,
        done: false,
        kind: ChildMatchKind.Wildcard,
        paramName,
        paramValue: part,
      };
    }
  }

  // Rest wildcard [...param]
  next = node._A as RouteData | undefined;
  if (next) {
    const paramName = next._P!;
    const restValue = parts.slice(partIndex).join('/');
    return {
      next,
      routePart: `[...${paramName}]`,
      done: true,
      kind: ChildMatchKind.Rest,
      paramName,
      paramValue: restValue,
    };
  }

  return undefined;
}

/**
 * Descend through a node and its pathless `_M` groups (depth-first, in `_M` order), returning the
 * first node for which `hit` yields a value, plus the chain of groups entered to reach it. The
 * shared traversal behind the index / rest / boundary lookups inside groups.
 */
function descendGroups<T>(
  node: RouteData,
  hit: (n: RouteData) => T | undefined
): { value: T; node: RouteData; groups: RouteData[] } | undefined {
  const value = hit(node);
  if (value !== undefined) {
    return { value, node, groups: [] };
  }
  if (node._M) {
    for (let j = 0; j < node._M.length; j++) {
      const group = node._M[j];
      const result = descendGroups(group, hit);
      if (result) {
        result.groups.unshift(group);
        return result;
      }
    }
  }
  return undefined;
}

/**
 * Find a node with `_I`/`_G` at the current level, including inside `_M` groups. Returns it and the
 * groups entered to reach it — excluding the target itself, whose `_L` the caller applies (so it
 * isn't double-counted).
 */
function findIndexNode(node: RouteData): { target: RouteData; groups: RouteData[] } | undefined {
  const r = descendGroups(node, (n) => (n._I || n._G != null ? n : undefined));
  return r ? { target: r.node, groups: r.groups.filter((g) => g !== r.node) } : undefined;
}

/**
 * Find a rest wildcard (`_A`) at the current node or inside its `_M` groups, with the groups
 * entered to reach it. Used to save fallback checkpoints during matching.
 */
function findRestNode(node: RouteData): { next: RouteData; groups: RouteData[] } | undefined {
  const r = descendGroups(node, (n) => n._A as RouteData | undefined);
  return r ? { next: r.value, groups: r.groups } : undefined;
}

/**
 * Find a `_4`/`_E` boundary inside a node's pathless `_M` groups (first in `_M` order), wrapped in
 * those groups' layouts.
 */
function findGroupBoundary(
  node: RouteData,
  layouts: ModuleLoader[],
  kind: '_4' | '_E'
): { v: ContentModuleLoader | ModuleLoader[]; layouts: ModuleLoader[] } | undefined {
  const r = descendGroups(node, (n) => n[kind]);
  if (!r) {
    return undefined;
  }
  const groupLayouts = [...layouts];
  for (const g of r.groups) {
    if (g._L) {
      groupLayouts.push(g._L);
    }
  }
  return { v: r.value, layouts: groupLayouts };
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
  loaderHashes: string[] | undefined;
  loaderPathsByHash: Record<string, string> | undefined;
  menuLoader: MenuModuleLoader | undefined;
  /** The nearest _E (error.tsx) boundary's chain to render on a thrown error (in its layouts). */
  errorLoader: ModuleLoader[] | undefined;
} {
  let node: RouteData = root;
  const params: PathParams = {};
  const routeParts: string[] = [];
  const layouts: ModuleLoader[] = [];
  const loaderHashes: string[] = [];
  const loaderPathsByHash: Record<string, string> = {};
  const errorLoaderRef: BoundaryRef = { v: undefined, layouts: [] };
  const notFoundLoaderRef: BoundaryRef = { v: undefined, layouts: [] };
  const menuLoaderRef: { v: MenuModuleLoader | undefined } = { v: undefined };
  // Nodes the walk passes that carry pathless `_M` groups (with the layout depth at each). On a miss,
  // a boundary in a group the walk never entered is recovered by searching these nearest-first.
  const groupNodes: { node: RouteData; depth: number }[] = [];

  // Collect the root's layout, error/404 boundaries, and menu (same logic as any node).
  collectNodeMeta(
    root,
    [],
    layouts,
    errorLoaderRef,
    notFoundLoaderRef,
    menuLoaderRef,
    loaderHashes,
    loaderPathsByHash
  );
  if (root._M) {
    groupNodes.push({ node: root, depth: layouts.length });
  }

  let done = false;
  let matched = true;
  const parts = pathname
    .split('/')
    .filter((p) => p.length > 0)
    .map(decodeURIComponent);

  // Track the deepest rest wildcard (_A) encountered during traversal as a fallback.
  // If _W matches a segment but the path ultimately leads to no route, we fall back to _A.
  let restFallback:
    | {
        aNode: RouteData;
        groups: RouteData[];
        paramName: string;
        restValue: string;
        routeParts: string[];
        params: PathParams;
        layouts: ModuleLoader[];
        loaderPathsByHash: Record<string, string>;
        errorLoader: ContentModuleLoader | ModuleLoader[] | undefined;
        errorLayouts: ModuleLoader[];
        notFoundLoader: ContentModuleLoader | ModuleLoader[] | undefined;
        notFoundLayouts: ModuleLoader[];
        menuLoader: MenuModuleLoader | undefined;
      }
    | undefined;

  let i = 0;
  const len = parts.length;
  for (; !done && i < len; i++) {
    const part = parts[i];
    const partLower = part.toLowerCase();

    const found = findChild(node, part, partLower, parts, i);
    if (!found) {
      matched = false;
      break;
    }

    // Wildcard route subtrees can still fall back to a sibling rest route if they dead-end later.
    // Exact route subtrees own their unmatched descendants.
    const restInfo = found.kind === ChildMatchKind.Wildcard ? findRestNode(node) : undefined;
    if (restInfo) {
      restFallback = {
        aNode: restInfo.next,
        groups: restInfo.groups,
        paramName: restInfo.next._P!,
        restValue: parts.slice(i).join('/'),
        routeParts: [...routeParts],
        params: { ...params },
        layouts: [...layouts],
        loaderPathsByHash: { ...loaderPathsByHash },
        errorLoader: errorLoaderRef.v,
        errorLayouts: errorLoaderRef.layouts,
        notFoundLoader: notFoundLoaderRef.v,
        notFoundLayouts: notFoundLoaderRef.layouts,
        menuLoader: menuLoaderRef.v,
      };
    }

    if (found.paramName) {
      params[found.paramName] = found.paramValue!;
    }

    routeParts.push(found.routePart);
    done = found.done;
    node = found.next;
    const matchedPathname = `/${parts.slice(0, found.done ? len : i + 1).join('/')}/`;
    collectNodeMeta(
      node,
      found.groups,
      layouts,
      errorLoaderRef,
      notFoundLoaderRef,
      menuLoaderRef,
      loaderHashes,
      loaderPathsByHash,
      matchedPathname
    );
    if (node._M) {
      groupNodes.push({ node, depth: layouts.length });
    }
  }

  // If we consumed all parts but the current node has no _I,
  // check for group children with _I or rest wildcard (_A)
  if (matched && !done && i === len) {
    // Check if _I is in a group child (e.g. (common)/index.tsx is the root "/" route)
    // This must come before _A checks so that an index route takes priority over
    // a rest wildcard with empty value.
    if (!node._I && node._G == null) {
      const indexResult = findIndexNode(node);
      if (indexResult) {
        collectNodeMeta(
          indexResult.target,
          indexResult.groups,
          layouts,
          errorLoaderRef,
          notFoundLoaderRef,
          menuLoaderRef,
          loaderHashes,
          loaderPathsByHash,
          pathname
        );
        node = indexResult.target;
      }
    }

    // Rest wildcard (`_A`) with empty value, on the node itself or inside its `_M` groups
    // (`findRestNode` matches both), captured via `collectNodeMeta`.
    if (!node._I && node._G == null) {
      const restInfo = findRestNode(node);
      if (restInfo) {
        const next = restInfo.next;
        const paramName = next._P!;
        params[paramName as string] = '';
        routeParts.push(`[...${paramName}]`);
        collectNodeMeta(
          next,
          restInfo.groups,
          layouts,
          errorLoaderRef,
          notFoundLoaderRef,
          menuLoaderRef,
          loaderHashes,
          loaderPathsByHash,
          pathname
        );
        node = next;
      }
    }
  }

  // Resolve loaders from _I or _G
  const resolved =
    matched && (done || i >= len) ? resolveLoaders(root, node, layouts, params) : undefined;
  const loaders = resolved?.loaders;

  // If the primary match failed but we have a rest wildcard fallback, try it.
  // This handles cases where _W matched a segment but the path led to no route,
  // while _A at the same level would have caught all remaining segments.
  if (!loaders && restFallback) {
    const fb = restFallback;
    const fbParams = { ...fb.params, [fb.paramName]: fb.restValue };
    const fbRouteParts = [...fb.routeParts, `[...${fb.paramName}]`];
    const fbLayouts = [...fb.layouts];
    const fbLoaderPathsByHash = { ...fb.loaderPathsByHash };
    const fbErrorRef: BoundaryRef = { v: fb.errorLoader, layouts: fb.errorLayouts };
    const fbNotFoundRef: BoundaryRef = { v: fb.notFoundLoader, layouts: fb.notFoundLayouts };
    const fbMenuRef: { v: MenuModuleLoader | undefined } = { v: fb.menuLoader };

    const fbLoaderHashes: string[] = [];
    collectNodeMeta(
      fb.aNode,
      fb.groups,
      fbLayouts,
      fbErrorRef,
      fbNotFoundRef,
      fbMenuRef,
      fbLoaderHashes,
      fbLoaderPathsByHash,
      pathname
    );

    const fallback = resolveLoaders(root, fb.aNode, fbLayouts, fbParams);
    if (fallback) {
      collectPageLoaders(fallback, fbLoaderHashes, fbLoaderPathsByHash, pathname);
      return {
        loaders: fallback.loaders,
        params: fbParams,
        routeParts: fbRouteParts,
        notFound: false,
        routeBundleNames: fb.aNode._B as string[] | undefined,
        loaderHashes: fbLoaderHashes.length > 0 ? fbLoaderHashes : undefined,
        loaderPathsByHash:
          Object.keys(fbLoaderPathsByHash).length > 0 ? fbLoaderPathsByHash : undefined,
        menuLoader: fbMenuRef.v,
        errorLoader: boundaryChain(fbErrorRef),
      };
    }
    // Update error/menu loaders (and their layout snapshots) from fallback for the not-found response
    errorLoaderRef.v = fbErrorRef.v;
    errorLoaderRef.layouts = fbErrorRef.layouts;
    notFoundLoaderRef.v = fbNotFoundRef.v;
    notFoundLoaderRef.layouts = fbNotFoundRef.layouts;
    menuLoaderRef.v = fbMenuRef.v;
  }

  if (!loaders) {
    // Pathless groups are URL-transparent: a boundary in one (e.g. `(app)/404.tsx`) acts at the group's
    // parent level. If the walk never descended into it, recover from the passed `_M`-group nodes
    // nearest-first (dead-end → root), each at its recorded layout depth.
    const recover = (kind: '_4' | '_E') => {
      for (let k = groupNodes.length - 1; k >= 0; k--) {
        const found = findGroupBoundary(
          groupNodes[k].node,
          layouts.slice(0, groupNodes[k].depth),
          kind
        );
        if (found) {
          return found;
        }
      }
      return undefined;
    };
    if (!notFoundLoaderRef.v) {
      const g = recover('_4');
      if (g) {
        notFoundLoaderRef.v = g.v;
        notFoundLoaderRef.layouts = g.layouts;
      }
    }
    if (!errorLoaderRef.v) {
      const g = recover('_E');
      if (g) {
        errorLoaderRef.v = g.v;
        errorLoaderRef.layouts = g.layouts;
      }
    }
    // A bare boundary uses its own (snapshotted) layouts; an override chain (404@layout / 404!) as-is.
    const ref = notFoundLoaderRef.v ? notFoundLoaderRef : errorLoaderRef.v ? errorLoaderRef : null;
    const boundary = ref?.v ?? httpErrorLoader;
    const boundaryLayouts = ref ? ref.layouts : layouts;
    return {
      loaders: Array.isArray(boundary) ? boundary : [...boundaryLayouts, boundary],
      params,
      routeParts,
      notFound: true,
      routeBundleNames: undefined,
      loaderHashes: undefined,
      loaderPathsByHash: undefined,
      menuLoader: menuLoaderRef.v,
      errorLoader: boundaryChain(errorLoaderRef),
    };
  }

  collectPageLoaders(resolved!, loaderHashes, loaderPathsByHash, pathname);

  return {
    loaders,
    params,
    routeParts,
    notFound: false,
    routeBundleNames: node._B as string[] | undefined,
    loaderHashes: loaderHashes.length > 0 ? loaderHashes : undefined,
    loaderPathsByHash: Object.keys(loaderPathsByHash).length > 0 ? loaderPathsByHash : undefined,
    menuLoader: menuLoaderRef.v,
    errorLoader: boundaryChain(errorLoaderRef),
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

function collectPageLoaders(
  { node, loaderPaths }: ResolvedIndex,
  hashes: string[],
  paths: Record<string, string>,
  pathname: string
) {
  if (loaderPaths) {
    hashes.length = 0;
    for (const hash in paths) {
      delete paths[hash];
    }
    Object.assign(paths, loaderPaths);
    hashes.push(...Object.keys(loaderPaths));
  }
  const pageHashes = node._D ?? [];
  if (Array.isArray(node._I)) {
    hashes.length = 0;
    for (const hash in paths) {
      if (!pageHashes.includes(hash)) {
        delete paths[hash];
      }
    }
  }
  hashes.push(...pageHashes);
  for (const hash of pageHashes) {
    paths[hash] ||= ensureSlash(pathname);
  }
}

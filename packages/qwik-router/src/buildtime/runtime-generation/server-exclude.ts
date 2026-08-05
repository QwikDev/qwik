import { readFile } from 'node:fs/promises';
import { findExports, findStaticImports } from 'mlly';
import { createRouteTester } from '../../ssg/routes';
import { isMarkdownExt, isPageExt } from '../../utils/fs';
import type { RouteModule } from '../../runtime/src/types';
import type { BuiltRoute, RoutingContext } from '../types';

/**
 * Non-GET RouteModule handlers keep a route server-side (onGet is served statically). Typed against
 * keyof RouteModule so a renamed/added handler fails to compile until classified.
 */
const NON_GET_HANDLERS = new Set<string>([
  'onRequest',
  'onPost',
  'onPut',
  'onPatch',
  'onDelete',
  'onHead',
  'onOptions',
] as const satisfies readonly Exclude<keyof RouteModule, 'onGet'>[]);

const ROUTER_MODULE = '@qwik.dev/router';

/**
 * Imports tying a route to the server — loaders, actions, and server$ (which POSTs to the route's
 * own URL). Matched on the import statement (the optimizer's ctxName isn't available
 * pre-transform); fail-safe, so a stray match only keeps a route.
 */
const SERVER_QRL = /\b(?:routeLoader|routeAction|globalAction|server)(?:\$|Qrl)/;

/**
 * True when the module exports no non-GET handler and imports no loader/action/server$ from the
 * router. Pure (no I/O) for direct unit testing.
 */
export function isServerFreeSource(code: string): boolean {
  for (const e of findExports(code)) {
    // Re-exports could surface a loader/action/handler from elsewhere — keep the route (fail-safe).
    if (e.specifier) {
      return false;
    }
    const names = [...(e.name ? [e.name] : []), ...(e.names ?? [])];
    if (names.some((n) => NON_GET_HANDLERS.has(n))) {
      return false;
    }
  }
  for (const imp of findStaticImports(code)) {
    if (imp.specifier === ROUTER_MODULE && SERVER_QRL.test(imp.code)) {
      return false;
    }
  }
  return true;
}

/**
 * Route file paths to drop from the production server route plan — prerendered, static, server-free
 * pages (own module and every layout) — so they tree-shake out of size-capped edge bundles.
 * Candidates come from the SSG include/exclude; server surfaces are detected in route/layout source
 * only. Fail-safe: dynamic routes, re-exports, and read errors keep the route. A loader/action
 * route stays whole — stripping just its dead component needs optimizer segment data.
 */
export async function getServerExcludedRoutes(
  ctx: RoutingContext,
  ssg: { include?: string[]; exclude?: string[] } | undefined
): Promise<Set<string>> {
  const excluded = new Set<string>();
  if (!ssg?.include?.length) {
    return excluded;
  }
  const isPrerendered = createRouteTester(ctx.opts.basePathname, ssg.include, ssg.exclude);
  // Layouts are shared across routes, so memoize per file. Caching the in-flight promise (sync
  // get/set) dedupes concurrent checks of the same layout to one read+lex.
  const serverFreeByFile = new Map<string, Promise<boolean>>();
  await Promise.all(
    ctx.routes.map(async (route) => {
      // Never prune 404.tsx/error.tsx: the SSR server renders them from the trie's `_4`/`_E` on a
      // direct request (SPA nav uses the client bundle, which would mask their absence).
      if (
        !isPageExt(route.ext) ||
        route.paramNames.length > 0 ||
        /\/(?:404|error)\.html$/.test(route.pathname) ||
        !isPrerendered(route.pathname)
      ) {
        return;
      }
      if (await isRouteServerFree(route, serverFreeByFile)) {
        excluded.add(route.filePath);
      }
    })
  );
  return excluded;
}

/** The route's own module and every layout wrapping it must be free of server code. */
async function isRouteServerFree(
  route: BuiltRoute,
  cache: Map<string, Promise<boolean>>
): Promise<boolean> {
  // Markdown route files carry no server code; layouts are never markdown.
  if (!isMarkdownExt(route.ext) && !(await isFileServerFree(route.filePath, cache))) {
    return false;
  }
  for (const layout of route.layouts) {
    if (!(await isFileServerFree(layout.filePath, cache))) {
      return false;
    }
  }
  return true;
}

/**
 * Read + lex a module once, memoized by path. Returns the cached in-flight promise (not async) so
 * concurrent callers share one read; read/parse failure keeps the route.
 */
function isFileServerFree(
  filePath: string,
  cache: Map<string, Promise<boolean>>
): Promise<boolean> {
  let pending = cache.get(filePath);
  if (!pending) {
    pending = readFile(filePath, 'utf-8')
      .then(isServerFreeSource)
      .catch(() => false);
    cache.set(filePath, pending);
  }
  return pending;
}

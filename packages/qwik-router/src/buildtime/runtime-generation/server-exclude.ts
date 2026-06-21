import { readFile } from 'node:fs/promises';
import { init, parse } from 'es-module-lexer';
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
 * router. Pure (no I/O) for direct unit testing; caller must `await init` first.
 */
export function isServerFreeSource(code: string): boolean {
  const [imports, exports] = parse(code);
  for (const e of exports) {
    if (NON_GET_HANDLERS.has(e.n)) {
      return false;
    }
  }
  for (const imp of imports) {
    const statement = code.slice(imp.ss, imp.se);
    // Re-exports could surface a loader/action/handler from elsewhere — keep the route (fail-safe).
    if (/^\s*export\b/.test(statement)) {
      return false;
    }
    if (imp.n === ROUTER_MODULE && SERVER_QRL.test(statement)) {
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
  await init;
  // Layouts are shared across routes, so memoize per file. Caching the in-flight promise (sync
  // get/set) dedupes concurrent checks of the same layout to one read+lex.
  const serverFreeByFile = new Map<string, Promise<boolean>>();
  await Promise.all(
    ctx.routes.map(async (route) => {
      // error.tsx/404.tsx are runtime handlers (the router gives them `…/error.html` / `…/404.html`
      // pathnames, and `createRouteTester` always reports `404.html` as prerendered) — never drop them.
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

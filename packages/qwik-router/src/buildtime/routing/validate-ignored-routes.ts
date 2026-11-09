import { addError, addWarning } from '../../utils/format';
import { isErrorName } from '../../utils/fs';
import type { RouteSourceFile, RoutingContext } from '../types';
import type { IgnoreMatcher } from './ignore-routes';
import { resolveLayout, resolveRoute } from './resolve-source-file';

/**
 * `ignoreRoutes` exists to prevent silent leaks, so it must not introduce new ones. Every way a
 * pattern can quietly do the wrong thing is reported here.
 */
export function validateIgnoredRoutes(
  ctx: RoutingContext,
  ignoreMatcher: IgnoreMatcher,
  routeSourceFiles: RouteSourceFile[]
) {
  reportUnusedPatterns(ctx, ignoreMatcher);

  if (ctx.ignoredRoutePaths.length > 0 && ctx.routes.length === 0) {
    addError(ctx, `qwik-router: ignoreRoutes left no routes at all. Loosen the patterns.`);
    return;
  }

  reportIgnoredLayouts(ctx, routeSourceFiles);
  reportIgnoredBoundaries(ctx);
}

/** A stale or misspelled pattern is the drift this feature is meant to catch, so it fails the build. */
function reportUnusedPatterns(ctx: RoutingContext, ignoreMatcher: IgnoreMatcher) {
  const unused = ignoreMatcher.unusedPatterns();
  if (unused.length === 0) {
    return;
  }
  const message =
    `qwik-router: ignoreRoutes ${unused.map((p) => `"${p}"`).join(', ')} matched nothing. ` +
    `Patterns are relative to routesDir and used as written - check for a typo, a leading "./" or "/", ` +
    `a folder that no longer exists, or a pattern already covered by another one.`;
  // In dev a half-deleted folder is normal and noticed immediately; in a build it is drift.
  if (ctx.isDevServer) {
    addWarning(ctx, message);
  } else {
    addError(ctx, message);
  }
}

/**
 * Layouts often hold auth `onRequest` guards, so a kept route inheriting an ignored one would ship
 * unguarded. Only a file-level pattern can do this: an ignored folder takes its routes with it.
 */
function reportIgnoredLayouts(ctx: RoutingContext, routeSourceFiles: RouteSourceFile[]) {
  const ignoredLayouts = ctx.ignoredRouteFiles
    .filter((file) => file.type === 'layout')
    .map((file) => resolveLayout(ctx.opts, file));
  if (ignoredLayouts.length === 0) {
    return;
  }

  // Kept layouts come first so a same-named kept layout still wins the lookup.
  const allLayouts = [...ctx.layouts, ...ignoredLayouts];
  for (const file of routeSourceFiles) {
    const inherited = resolveRoute(ctx.opts, allLayouts, file).layouts.filter((layout) =>
      ignoredLayouts.includes(layout)
    );
    for (const layout of inherited) {
      addError(
        ctx,
        `qwik-router: ignoreRoutes skipped the layout "${layout.filePath}", but it still wraps the kept route "${file.filePath}". Ignore the whole folder or none of it.`
      );
    }
  }
}

/** A dropped `404`/`error` silently hands its routes to the nearest parent boundary. */
function reportIgnoredBoundaries(ctx: RoutingContext) {
  for (const file of ctx.ignoredRouteFiles) {
    if (file.type !== 'route' || !isErrorName(file.extlessName)) {
      continue;
    }
    const coveredRoute = ctx.routes.find((route) => route.filePath.startsWith(file.dirPath + '/'));
    if (coveredRoute) {
      addWarning(
        ctx,
        `qwik-router: ignoreRoutes skipped the boundary "${file.filePath}", which still covers kept routes such as "${coveredRoute.filePath}". The nearest parent boundary takes over.`
      );
    }
  }
}

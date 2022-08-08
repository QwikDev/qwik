import type { BuildContext, BuildRoute, RouteSourceFile } from './types';
import { addError } from './utils/format';
import { validateSourceFiles } from './routing/source-file';
import { walkRoutes } from './routing/walk-routes-dir';
import { getRouteParams } from '../runtime/src/library/routing';
import type { RouteParams } from '../runtime/src/library/types';
import { resolveSourceFiles } from './routing/resolve-source-file';

export async function build(ctx: BuildContext) {
  try {
    const opts = ctx.opts;
    const routesDir = opts.routesDir;

    const sourceFiles = await walkRoutes(routesDir);

    const resolved = resolveSourceFiles(opts, sourceFiles);
    ctx.layouts = resolved.layouts;
    ctx.routes = resolved.routes;
    ctx.errors = resolved.errors;
    ctx.entries = resolved.entries;
    ctx.menus = resolved.menus;

    validateBuild(ctx, sourceFiles);
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

export async function buildFromUrlPathname(
  ctx: BuildContext,
  pathname: string
): Promise<{ route: BuildRoute; params: RouteParams } | null> {
  const sourceFiles = await walkRoutes(ctx.opts.routesDir);

  const resolved = resolveSourceFiles(ctx.opts, sourceFiles);
  ctx.layouts = resolved.layouts;
  ctx.routes = resolved.routes;
  ctx.errors = resolved.errors;
  ctx.entries = resolved.entries;
  ctx.menus = resolved.menus;

  for (const d of ctx.diagnostics) {
    if (d.type === 'error') {
      console.error(d.message);
    } else {
      console.warn(d.message);
    }
  }

  for (const route of resolved.routes) {
    const match = route.pattern.exec(pathname);
    if (match) {
      return {
        route,
        params: getRouteParams(route.paramNames, match),
      };
    }
  }

  return null;
}

function validateBuild(ctx: BuildContext, sourceFiles: RouteSourceFile[]) {
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

  validateSourceFiles(ctx, sourceFiles);
}

import type { BuildContext } from './types';
import { addError } from '../utils/format';
import { walkRoutes } from './routing/walk-routes-dir';
import { resolveSourceFiles } from './routing/resolve-source-file';

export async function build(ctx: BuildContext) {
  try {
    await updateBuildContext(ctx);
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

export async function updateBuildContext(ctx: BuildContext) {
  if (!ctx.activeBuild) {
    ctx.activeBuild = new Promise<void>((resolve, reject) => {
      walkRoutes(ctx.opts.routesDir)
        .then((sourceFiles) => {
          const resolved = resolveSourceFiles(ctx.opts, sourceFiles);
          ctx.layouts = resolved.layouts;
          ctx.routes = resolved.routes;
          ctx.entries = resolved.entries;
          ctx.serviceWorkers = resolved.serviceWorkers;
          ctx.menus = resolved.menus;
          resolve();
        }, reject)
        .finally(() => {
          ctx.activeBuild = null;
        });
    });
  }
  return ctx.activeBuild;
}

function validateBuild(ctx: BuildContext) {
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
}

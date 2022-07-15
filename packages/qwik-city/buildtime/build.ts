import type { BuildContext } from './types';
import fs from 'fs';
import { dirname, join } from 'path';
import { updatePageRoute } from './routing/page';
import { addError } from './utils/format';
import { sortRoutes } from './routing/sort-routes';
import { normalizePath } from './utils/fs';
import { parseFileSystem } from './routing/parse-file-system';
import { updateMenu } from './markdown/menu';

export async function build(ctx: BuildContext) {
  try {
    if (ctx.dirty) {
      const routesDir = ctx.opts.routesDir;

      await loadRoutes(ctx, routesDir, dirname(routesDir));

      for (const route of ctx.routes) {
        if (route.type === 'page') {
          updatePageRoute(routesDir, route, ctx.layouts);
        }
      }

      await Promise.all(ctx.menus.map((m) => updateMenu(ctx, m)));

      sort(ctx);
      validateBuild(ctx);
      ctx.dirty = false;
    }
  } catch (e) {
    addError(ctx, e);
  }
}

async function loadRoutes(ctx: BuildContext, dirPath: string, dirName: string) {
  let dirItems: string[];
  try {
    dirItems = await fs.promises.readdir(dirPath);
  } catch (e) {
    // if it error'd then it must not be a directory so let's ignore
    // top routes dir already validated it exists
    return;
  }

  await Promise.all(
    dirItems.map(async (itemName) => {
      try {
        const itemPath = normalizePath(join(dirPath, itemName));
        const wasHandled = parseFileSystem(ctx, dirPath, dirName, itemPath, itemName);

        if (!wasHandled) {
          await loadRoutes(ctx, itemPath, itemName);
        }
      } catch (e) {
        addError(ctx, e);
      }
    })
  );
}

function sort(ctx: BuildContext) {
  ctx.routes.sort(sortRoutes);

  ctx.layouts.sort((a, b) => {
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });

  ctx.menus.sort((a, b) => {
    if (a.pathname < b.pathname) return -1;
    if (a.pathname > b.pathname) return 1;
    return 0;
  });
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

import type { BuildContext, BuildLayout, BuildRoute } from './types';
import fs from 'fs';
import { basename, join } from 'path';
import { isMenuFileName, createMenu } from './markdown/menu';
import { createPageRoute, updatePageRoute } from './routing/page';
import { addError } from './utils/format';
import { createEndpointRoute } from './routing/endpoint';
import { sortRoutes } from './routing/sort-routes';
import { createLayout, isLayoutFileName } from './routing/layout';
import { isEndpointFileName, isMarkdownFileName, isPageFileName } from './utils/fs';

export async function build(ctx: BuildContext) {
  try {
    if (ctx.dirty) {
      const routesDirItems = await fs.promises.readdir(ctx.opts.routesDir);
      await loadRoutes(ctx, ctx.opts.routesDir, ctx.opts.routesDir, routesDirItems);

      updateRoutes(ctx.opts.routesDir, ctx.routes, ctx.layouts);
      sort(ctx);
      validateBuild(ctx);
      ctx.dirty = false;
    }
  } catch (e) {
    addError(ctx, e);
  }
}

async function loadRoutes(ctx: BuildContext, routesDir: string, dir: string, dirItems: string[]) {
  await Promise.all(
    dirItems.map(async (itemName) => {
      if (!IGNORE_NAMES[itemName]) {
        try {
          const dirName = basename(dir);
          const itemPath = join(dir, itemName);

          if (isLayoutFileName(dirName, itemName)) {
            const layout = createLayout(ctx, routesDir, itemPath);
            ctx.layouts.push(layout);
          } else if (isMenuFileName(itemName)) {
            const menu = await createMenu(ctx, routesDir, itemPath);
            ctx.menus.push(menu);
          } else if (isEndpointFileName(itemName)) {
            const endpointRoute = createEndpointRoute(ctx, routesDir, itemPath);
            ctx.routes.push(endpointRoute);
          } else if (isMarkdownFileName(itemName)) {
            const markdownRoute = createPageRoute(ctx, routesDir, itemPath, 'markdown');
            ctx.routes.push(markdownRoute);
          } else if (isPageFileName(itemName)) {
            const pageRoute = createPageRoute(ctx, routesDir, itemPath, 'module');
            ctx.routes.push(pageRoute);
          } else {
            try {
              const childDirItems = await fs.promises.readdir(itemPath);
              await loadRoutes(ctx, routesDir, itemPath, childDirItems);
            } catch (e) {
              // if it error'd then it must not be a directory so let's ignore
            }
          }
        } catch (e) {
          addError(ctx, e);
        }
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

function updateRoutes(routesDir: string, routes: BuildRoute[], layouts: BuildLayout[]) {
  for (const route of routes) {
    if (route.type === 'page') {
      updatePageRoute(routesDir, route, layouts);
    }
  }
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

/** File and directory names we already know we can just skip over */
const IGNORE_NAMES: { [key: string]: boolean } = {
  build: true,
  dist: true,
  node_modules: true,
  target: true,
  LICENSE: true,
  'LICENSE.md': true,
  README: true,
  'README.md': true,
  Dockerfile: true,
  Makefile: true,
  WORKSPACE: true,
  '.devcontainer': true,
  '.gitignore': true,
  '.gitattributese': true,
  '.gitkeep': true,
  '.github': true,
  '.husky': true,
  '.npmrc': true,
  '.nvmrc': true,
  '.prettierignore': true,
  '.history': true,
  '.vscode': true,
  '.yarn': true,
  '.DS_Store': true,
  'thumbs.db': true,
};

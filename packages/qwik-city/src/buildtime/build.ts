import type { BuildContext } from './types';
import fs from 'fs';
import { join } from 'path';
import { parseMenuFile } from './markdown/parse-menu';
import { parseMarkdownFile } from './markdown/parse-markdown';
import {
  isMarkdownFileName,
  isMenuFileName,
  isPageFileName,
  isLayoutFileName,
  isEndpointFileName,
} from './utils/fs';
import { parseLayoutFile, updatePageLayouts } from './pages/parse-layout';
import { parsePageFile } from './pages/parse-page';
import { addError } from './utils/format';
import { parseEndpointFile } from './endpoint/parse-endpoint';
import { sortRoutes } from './routing/sort-routes';
import { resetBuildContext } from './utils/context';

export async function build(ctx: BuildContext) {
  resetBuildContext(ctx);

  try {
    const routesDirItems = await fs.promises.readdir(ctx.opts.routesDir);
    await loadRoutes(ctx, ctx.opts.routesDir, ctx.opts.routesDir, routesDirItems);

    sort(ctx);
    validateBuild(ctx);
    updatePageLayouts(ctx.opts.routesDir, ctx.routes, ctx.layouts);
  } catch (e) {
    addError(ctx, e);
  }
}

async function loadRoutes(ctx: BuildContext, routesDir: string, dir: string, dirItems: string[]) {
  await Promise.all(
    dirItems.map(async (itemName) => {
      if (!IGNORE_NAMES[itemName]) {
        try {
          const itemPath = join(dir, itemName);

          if (isLayoutFileName(itemName)) {
            const layout = parseLayoutFile(ctx, routesDir, itemPath);
            ctx.layouts.push(layout);
          } else if (isMenuFileName(itemName)) {
            const menuContent = await fs.promises.readFile(itemPath, 'utf-8');
            const menu = parseMenuFile(ctx, routesDir, itemPath, menuContent);
            ctx.menus.push(menu);
          } else if (isMarkdownFileName(itemName)) {
            const mdContent = await fs.promises.readFile(itemPath, 'utf-8');
            const mdRoute = parseMarkdownFile(ctx, routesDir, itemPath, mdContent);
            ctx.routes.push(mdRoute);
          } else if (isEndpointFileName(itemName)) {
            const endpointRoute = parseEndpointFile(ctx, routesDir, itemPath);
            ctx.routes.push(endpointRoute);
          } else if (isPageFileName(itemName)) {
            const pageRoute = parsePageFile(ctx, routesDir, itemPath);
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

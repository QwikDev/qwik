import type { BuildContext, BuildLayout } from './types';
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
    const routesDirPromise = loadRoutes(
      ctx,
      ctx.opts.routesDir,
      ctx.opts.routesDir,
      routesDirItems
    );

    const dirsPromises = ctx.opts.dirs.map((dir) => loadDir(ctx, dir, dir));

    await Promise.all([routesDirPromise, ...dirsPromises]);

    ctx.routes.sort(sortRoutes);
    ctx.layouts.sort(sortLayouts);

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
          } else if (isMarkdownFileName(itemName)) {
            const mdContent = await fs.promises.readFile(itemPath, 'utf-8');
            const mdRoute = parseMarkdownFile(ctx, routesDir, itemPath, mdContent);
            ctx.routes.push(mdRoute);
          } else if (isPageFileName(itemName)) {
            const pageRoute = parsePageFile(ctx, routesDir, itemPath);
            ctx.routes.push(pageRoute);
          } else if (isEndpointFileName(itemName)) {
            const endpointRoute = parseEndpointFile(ctx, routesDir, itemPath);
            ctx.routes.push(endpointRoute);
          } else if (isMenuFileName(itemName)) {
            const menuContent = await fs.promises.readFile(itemPath, 'utf-8');
            const menu = parseMenuFile(ctx, itemPath, menuContent);
            ctx.menus.push(menu);
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

async function loadDir(ctx: BuildContext, baseDir: string, dir: string) {
  const items = await fs.promises.readdir(dir);

  await Promise.all(
    items.map(async (itemName) => {
      if (!IGNORE_NAMES[itemName]) {
        try {
          const itemPath = join(dir, itemName);

          if (isMarkdownFileName(itemName)) {
            const mdContent = await fs.promises.readFile(itemPath, 'utf-8');
            const page = parseMarkdownFile(ctx, baseDir, itemPath, mdContent);
            ctx.routes.push(page);
          } else {
            const s = await fs.promises.stat(itemPath);
            if (s.isDirectory()) {
              await loadDir(ctx, baseDir, itemPath);
            }
          }
        } catch (e) {
          addError(ctx, e);
        }
      }
    })
  );
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
  '.DS_Store': true,
};

function sortLayouts(a: BuildLayout, b: BuildLayout) {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

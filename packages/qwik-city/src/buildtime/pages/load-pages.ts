import type { BuildContext } from '../types';
import fs from 'fs';
import { extname, join } from 'path';
import { parseIndexFile } from '../markdown/parse-index';
import { parseMarkdownFile } from '../markdown/parse-markdown';
import { isMarkdownFile, isIndexFileName, isTypeScriptFile, isLayoutFileName } from '../utils/fs';
import { parseLayoutFile, updatePageLayouts } from './parse-layout';
import { parseTypeScriptFile } from './parse-page';

export async function loadPages(ctx: BuildContext) {
  ctx.pages.length = 0;
  ctx.indexes.length = 0;
  ctx.layouts.length = 0;

  await loadPagesDir(ctx, ctx.opts.pagesDir);

  updatePageLayouts(ctx.rootDir, ctx.pages, ctx.layouts);
}

async function loadPagesDir(ctx: BuildContext, dir: string) {
  try {
    const items = await fs.promises.readdir(dir);

    await Promise.all(
      items.map(async (itemName) => {
        if (!IGNORE_NAMES[itemName]) {
          try {
            const itemPath = join(dir, itemName);

            if (isLayoutFileName(itemName)) {
              const layout = parseLayoutFile(ctx.rootDir, itemPath);
              ctx.layouts.push(layout);
            } else if (isIndexFileName(itemName)) {
              const indexContent = await fs.promises.readFile(itemPath, 'utf-8');
              const index = parseIndexFile(ctx, itemPath, indexContent);
              ctx.indexes.push(index);
            } else if (isMarkdownFile(itemName)) {
              const mdContent = await fs.promises.readFile(itemPath, 'utf-8');
              const page = parseMarkdownFile(ctx.opts, itemPath, mdContent);
              ctx.pages.push(page);
            } else if (isTypeScriptFile(itemName)) {
              const page = parseTypeScriptFile(ctx, itemPath);
              ctx.pages.push(page);
            } else if (!IGNORE_EXT[extname(itemName)]) {
              const s = await fs.promises.stat(itemPath);
              if (s.isDirectory()) {
                await loadPagesDir(ctx, itemPath);
              }
            }
          } catch (e) {
            ctx.log.warn(String(e));
          }
        }
      })
    );
  } catch (e) {
    ctx.log.warn(String(e));
  }
}

/** Known file extension we know are not directories so we can skip over them */
const IGNORE_EXT: { [key: string]: boolean } = {
  '.js': true,
  '.mjs': true,
  '.cjs': true,
  '.jsx': true,
  '.css': true,
  '.html': true,
  '.png': true,
  '.jpg': true,
  '.jpeg': true,
  '.gif': true,
  '.ico': true,
  '.svg': true,
  '.txt': true,
  '.json': true,
  '.yml': true,
  '.yaml': true,
  '.toml': true,
  '.lock': true,
  '.log': true,
  '.bzl': true,
};

/** Known file and directory names we know we can skip over */
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

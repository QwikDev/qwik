import fs from 'fs';
import { extname, join } from 'path';
import { parseMarkdownFile, parseIndexFile } from './parse';
import type { PluginContext } from './types';
import { IGNORE_EXT, IGNORE_NAMES, isMarkdownFile, isReadmeFile } from './utils';

export async function loadPages(ctx: PluginContext, warn: (msg: string) => void) {
  ctx.pages = [];
  ctx.indexes = [];
  await loadPagesDir(ctx, ctx.opts.pagesDir, warn);
}

async function loadPagesDir(ctx: PluginContext, dir: string, warn: (msg: string) => void) {
  try {
    const items = await fs.promises.readdir(dir);

    await Promise.all(
      items.map(async (itemName) => {
        if (!IGNORE_NAMES[itemName]) {
          try {
            const itemPath = join(dir, itemName);
            if (isReadmeFile(itemName)) {
              const indexContent = await fs.promises.readFile(itemPath, 'utf-8');
              const index = parseIndexFile(ctx, itemPath, indexContent);
              ctx.indexes.push(index);
            } else if (isMarkdownFile(ctx, itemName)) {
              const mdContent = await fs.promises.readFile(itemPath, 'utf-8');
              const page = parseMarkdownFile(ctx, itemPath, mdContent);
              ctx.pages.push(page);
            } else if (!IGNORE_EXT[extname(itemName)]) {
              const s = await fs.promises.stat(itemPath);
              if (s.isDirectory()) {
                await loadPagesDir(ctx, itemPath, warn);
              }
            }
          } catch (e) {
            warn(String(e));
          }
        }
      })
    );
  } catch (e) {
    warn(String(e));
  }
}

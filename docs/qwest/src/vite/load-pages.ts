import { readdir, readFile, stat } from 'fs/promises';
import { extname, join } from 'path';
import { parseMarkdownFile, parseIndexFile } from './parse';
import type { NormalizedPluginOptions, ParsedData } from './types';
import { IGNORE_EXT, IGNORE_NAMES, isMarkdownFile, isReadmeFile } from './utils';

export async function loadPages(opts: NormalizedPluginOptions, warn: (msg: string) => void) {
  const data: ParsedData = { pages: [], indexes: [] };
  await loadPagesDir(opts, opts.pagesDir, warn, data);
  return data;
}

async function loadPagesDir(
  opts: NormalizedPluginOptions,
  dir: string,
  warn: (msg: string) => void,
  data: ParsedData
) {
  try {
    const items = await readdir(dir);

    await Promise.all(
      items.map(async (itemName) => {
        if (!IGNORE_NAMES[itemName]) {
          try {
            const itemPath = join(dir, itemName);
            if (isReadmeFile(itemName)) {
              const indexContent = await readFile(itemPath, 'utf-8');
              const index = parseIndexFile(opts, itemPath, indexContent);
              data.indexes.push(index);
            } else if (isMarkdownFile(opts, itemName)) {
              const mdContent = await readFile(itemPath, 'utf-8');
              const page = parseMarkdownFile(opts, itemPath, mdContent);
              data.pages.push(page);
            } else if (!IGNORE_EXT[extname(itemName)]) {
              const s = await stat(itemPath);
              if (s.isDirectory()) {
                await loadPagesDir(opts, itemPath, warn, data);
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

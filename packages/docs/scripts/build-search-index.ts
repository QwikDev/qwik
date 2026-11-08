import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as pagefind from 'pagefind';
import snarkdown from 'snarkdown';

export interface ApiSearchPage {
  url: string;
  content: string;
}

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiRoutesDir = path.join(packageDir, 'src', 'routes', 'api');
// Keep `component$`, `<Slot>` and `q:slot` searchable as whole words.
const SEARCH_INCLUDE_CHARACTERS = '$<>:';
const API_SYMBOL_HEADING = /^<h2 id="([^"]+)">(.*)<\/h2>$/m;
const EDIT_LINK = /^\[Edit this section\]\(.*\)$/gm;

/** One search page per API symbol, linking to its anchor on the package API page. */
export function createApiSearchPages(routesDir = apiRoutesDir): ApiSearchPage[] {
  return fs.readdirSync(routesDir).flatMap((apiDir) => {
    const apiPagePath = path.join(routesDir, apiDir, 'index.mdx');
    if (!fs.existsSync(apiPagePath)) {
      return [];
    }
    // Splitting on the capturing heading yields [intro, anchor, name, body, anchor, name, body, ...].
    const [, ...sections] = fs.readFileSync(apiPagePath, 'utf-8').split(API_SYMBOL_HEADING);
    const pages: ApiSearchPage[] = [];
    for (let i = 0; i < sections.length; i += 3) {
      const [anchor, name, body] = sections.slice(i, i + 3);
      const description = snarkdown(body.replace(EDIT_LINK, '').trim());
      // The h1 gets Pagefind's heading boost, so symbol names outrank prose mentions.
      pages.push({
        url: `/api/${apiDir}/#${anchor}`,
        content: `<html lang="en"><body data-pagefind-body><h1>${name}</h1>${description}</body></html>`,
      });
    }
    return pages;
  });
}

function assertNoErrors(response: { errors: string[] }) {
  if (response.errors.length > 0) {
    throw new Error(`Pagefind failed:\n${response.errors.join('\n')}`);
  }
}

export async function buildSearchIndex(outputPath: string) {
  const { index, errors } = await pagefind.createIndex({
    includeCharacters: SEARCH_INCLUDE_CHARACTERS,
  });
  if (!index) {
    throw new Error(`Pagefind failed:\n${errors.join('\n')}`);
  }
  try {
    assertNoErrors(await index.addDirectory({ path: path.join(packageDir, 'dist') }));
    for (const page of createApiSearchPages()) {
      assertNoErrors(await index.addHTMLFile(page));
    }
    assertNoErrors(await index.writeFiles({ outputPath }));
  } finally {
    await pagefind.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildSearchIndex(process.argv[2] ?? 'dist/pagefind');
}

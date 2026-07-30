import matter from 'gray-matter';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

const VIRTUAL_ID = '@docs-updated';

/** Public URL for a route index file: drop pathless `(group)` segments and the index filename. */
function fileToHref(relPath: string): string {
  const clean = relPath
    .split(sep)
    .join('/')
    .replace(/\([^/]+\)\//g, '')
    .replace(/index\.mdx?$/, '')
    .replace(/^\/+|\/+$/g, '');
  return `/${clean}`;
}

function* walkIndexFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkIndexFiles(full);
    } else if (/^index\.mdx?$/.test(entry.name)) {
      yield full;
    }
  }
}

/**
 * Exposes `@docs-updated` with `{ updated, maxTs }` mapping each doc page to its frontmatter
 * `updated_at`, so the sidebar can flag pages changed since a visitor's last visit.
 */
export function docsUpdatedData(routesDir: string): Plugin {
  return {
    name: 'docsUpdatedData',

    resolveId(id) {
      if (id === VIRTUAL_ID) {
        return id;
      }
    },

    load(id) {
      if (id !== VIRTUAL_ID) {
        return null;
      }
      const updated: Record<string, string> = {};
      let maxTs = '';
      for (const file of walkIndexFiles(routesDir)) {
        const raw = matter.read(file).data.updated_at;
        if (!raw) {
          continue;
        }
        const ts = raw instanceof Date ? raw.toISOString() : String(raw);
        updated[fileToHref(relative(routesDir, file))] = ts;
        if (ts > maxTs) {
          maxTs = ts;
        }
      }
      return `export const updated = ${JSON.stringify(updated)};\nexport const maxTs = ${JSON.stringify(maxTs)};`;
    },
  };
}

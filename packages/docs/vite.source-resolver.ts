import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

const SOURCE_PREFIX = 'source:';
const RESOLVED_SOURCE_PREFIX = '\0source:';

export function sourceResolver(root: string): Plugin {
  return {
    name: 'source-code-loader',
    resolveId(id, importer) {
      if (importer && id.startsWith(SOURCE_PREFIX)) {
        const [_, path] = id.split(SOURCE_PREFIX);
        const base = id.startsWith('.') ? dirname(importer) : root;
        return RESOLVED_SOURCE_PREFIX + join(base, path);
      }
    },
    load(id) {
      if (id.startsWith(RESOLVED_SOURCE_PREFIX)) {
        const [_, path] = id.split(RESOLVED_SOURCE_PREFIX);
        const content = readFileSync(path, 'utf-8');
        return `export default {
          code: ${JSON.stringify(content)},
          path: ${JSON.stringify(path.replace(root, ''))},
        };`;
      }
    },
  };
}

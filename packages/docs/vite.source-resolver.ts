import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const SOURCE_PREFIX = 'source:';
const RESOLVED_SOURCE_PREFIX = '\0source:';

export function sourceResolver(root: string) {
  return {
    name: 'source-code-loader',
    resolveId(id, importer) {
      if (importer && id.startsWith(SOURCE_PREFIX)) {
        const [_, path] = id.split(SOURCE_PREFIX);
        return RESOLVED_SOURCE_PREFIX + join(dirname(importer), path);
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

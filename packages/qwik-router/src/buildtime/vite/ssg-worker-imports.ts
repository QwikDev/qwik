import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

export const SSG_WORKER_IMPORT_PREFIX = '@qwik-router-ssg-worker/';

export function ssgWorkerImportPlugin(): Plugin {
  return {
    name: 'qwik-router-ssg-worker-imports',
    enforce: 'pre',
    async resolveId(id, importer) {
      if (!id.startsWith(SSG_WORKER_IMPORT_PREFIX)) {
        return null;
      }

      // Give worker-only imports their own module ids so Vite keeps the SSG worker graph
      // isolated instead of folding it back into run-ssg.js.
      const subpath = id.slice(SSG_WORKER_IMPORT_PREFIX.length);
      const sourceId = fileURLToPath(new URL(`../../${subpath}`, import.meta.url));
      const resolved = await this.resolve(sourceId, importer, { skipSelf: true });
      return `${(resolved ?? { id: sourceId }).id}?ssg-worker`;
    },
  };
}

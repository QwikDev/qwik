import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Rolldown } from 'vite';
import { describe, expect, it } from 'vitest';

// run-ssg builds as two entries: the worker entry owns the render machinery, the main entry's static
// graph does not. This guards that isolation.
describe('SSG worker bundle isolation', () => {
  it('keeps the render machinery in the worker entry, not the main entry', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'qwik-router-ssg-'));
    const appDir = join(tempDir, 'app');
    const outDir = join(tempDir, 'server');
    const routerSsgEntry = fileURLToPath(new URL('./index.ts', import.meta.url));

    try {
      await mkdir(appDir, { recursive: true });
      await writeFile(join(appDir, 'entry.ssr.ts'), `export default (() => null) as any;\n`);
      await writeFile(
        join(appDir, 'qwik-router-config.ts'),
        `export default { routes: {} } as any;\n`
      );
      await writeFile(
        join(appDir, 'run-ssg.ts'),
        [
          `import qwikRouterConfig from './qwik-router-config';`,
          `import { runSsg } from '@test-router-ssg';`,
          `runSsg({`,
          `  qwikRouterConfig,`,
          `  workerFilePath: new URL('./run-ssg-worker.js', import.meta.url).href,`,
          `  outDir: './dist',`,
          `  origin: 'https://qwik.dev',`,
          `  include: ['/*'],`,
          `}).catch(() => process.exit(1));`,
          ``,
        ].join('\n')
      );
      await writeFile(
        join(appDir, 'run-ssg-worker.ts'),
        [
          `import render from './entry.ssr';`,
          `import qwikRouterConfig from './qwik-router-config';`,
          `import { startWorker } from '@test-router-ssg';`,
          `startWorker({ render, qwikRouterConfig }).catch(() => process.exit(1));`,
          ``,
        ].join('\n')
      );

      const result = await build({
        configFile: false,
        publicDir: false,
        root: appDir,
        logLevel: 'silent',
        resolve: { alias: { '@test-router-ssg': routerSsgEntry } },
        build: {
          emptyOutDir: true,
          minify: false,
          outDir,
          ssr: true,
          rollupOptions: {
            input: {
              'run-ssg': join(appDir, 'run-ssg.ts'),
              'run-ssg-worker': join(appDir, 'run-ssg-worker.ts'),
            },
            external: ['@qwik-router-config'],
          },
        },
      });

      const outputs = Array.isArray(result) ? result : [result as Rolldown.RolldownOutput];
      const chunks = outputs
        .flatMap((o) => o.output)
        .filter((c): c is Rolldown.OutputChunk => c.type === 'chunk');
      const byFile = new Map(chunks.map((c) => [c.fileName, c]));

      const mainEntry = chunks.find((c) => c.isEntry && /^run-ssg\./.test(basename(c.fileName)));
      const workerEntry = chunks.find(
        (c) => c.isEntry && /^run-ssg-worker\./.test(basename(c.fileName))
      );
      expect(mainEntry, 'main entry emitted').toBeTruthy();
      expect(workerEntry, 'worker entry emitted').toBeTruthy();

      // Reachable chunks from an entry: the visited Set doubles as the worklist.
      const reach = (start: string, includeDynamic: boolean) => {
        const seen = new Set([start]);
        for (const fileName of seen) {
          const chunk = byFile.get(fileName);
          if (!chunk) {
            continue;
          }
          const edges = includeDynamic
            ? [...chunk.imports, ...chunk.dynamicImports]
            : chunk.imports;
          edges.forEach((edge) => seen.add(edge));
        }
        return seen;
      };
      const reachesRenderMachinery = (files: Set<string>) =>
        [...files].some((fileName) =>
          (byFile.get(fileName)?.moduleIds ?? []).some((id) =>
            /worker-thread|resolve-request-handlers|request-event-core|user-response/.test(id)
          )
        );

      // worker-thread is a dynamic import, so follow dynamic edges from the worker but only static
      // edges from the main entry.
      expect(reachesRenderMachinery(reach(workerEntry!.fileName, true))).toBe(true);
      expect(reachesRenderMachinery(reach(mainEntry!.fileName, false))).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

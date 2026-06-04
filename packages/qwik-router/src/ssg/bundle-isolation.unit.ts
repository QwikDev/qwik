import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';
import { ssgWorkerImportPlugin } from '../buildtime/vite/ssg-worker-imports';

describe('SSG worker bundle isolation', () => {
  it('does not make worker chunks import the run-ssg entry', async () => {
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
          `import { isMainThread } from 'node:worker_threads';`,
          `import render from './entry.ssr';`,
          `import qwikRouterConfig from './qwik-router-config';`,
          ``,
          `const ssgOpts = {`,
          `  outDir: './dist',`,
          `  origin: 'https://qwik.dev',`,
          `  include: ['/*'],`,
          `};`,
          ``,
          `if (isMainThread) {`,
          `  const { runSsg } = await import('@test-router-ssg');`,
          `  await runSsg({`,
          `    render,`,
          `    qwikRouterConfig,`,
          `    workerFilePath: new URL(import.meta.url).href,`,
          `    ...ssgOpts,`,
          `  });`,
          `} else {`,
          `  const { startWorker } = await import('@test-router-ssg');`,
          `  await startWorker({ render, qwikRouterConfig });`,
          `}`,
          ``,
        ].join('\n')
      );

      await build({
        configFile: false,
        publicDir: false,
        root: appDir,
        plugins: [ssgWorkerImportPlugin()],
        resolve: {
          alias: {
            '@test-router-ssg': routerSsgEntry,
          },
        },
        build: {
          emptyOutDir: true,
          minify: false,
          outDir,
          ssr: true,
          rollupOptions: {
            input: join(appDir, 'run-ssg.ts'),
            external: ['@qwik-router-config'],
          },
        },
      });

      const jsFiles = await collectJsFiles(outDir);
      const nonEntryFiles = jsFiles.filter((file) => !/^run-ssg\./.test(basename(file)));

      expect(nonEntryFiles.length).toBeGreaterThan(0);

      const entryBackrefs: string[] = [];
      for (const file of nonEntryFiles) {
        const content = await readFile(file, 'utf-8');
        if (/from ['"].*run-ssg\.(?:js|mjs)['"]/.test(content)) {
          entryBackrefs.push(file);
        }
      }

      expect(entryBackrefs).toEqual([]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

async function collectJsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectJsFiles(fullPath);
      }
      if (/\.(?:m?js)$/.test(entry.name)) {
        return [fullPath];
      }
      return [];
    })
  );

  return files.flat();
}

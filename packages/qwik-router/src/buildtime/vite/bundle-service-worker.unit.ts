import { runInNewContext } from 'node:vm';
import type { Rolldown } from 'vite';
import { describe, expect, test } from 'vitest';
import { bundleServiceWorkerChunks } from './bundle-service-worker';

const chunk = (
  fileName: string,
  code: string,
  imports: string[] = [],
  dynamicImports: string[] = []
) =>
  ({ type: 'chunk', fileName, code, imports, dynamicImports }) as unknown as Rolldown.OutputChunk;

const toBundle = (...chunks: Rolldown.OutputChunk[]): Rolldown.OutputBundle =>
  Object.fromEntries(chunks.map((c) => [c.fileName, c]));

const runAsServiceWorker = (code: string) => {
  const self: Record<string, unknown> = {};
  runInNewContext(code, { self });
  return self;
};

describe('bundleServiceWorkerChunks', () => {
  test(`GIVEN a service worker chunk that imports a shared chunk
        THEN it becomes a classic script with the shared code inlined`, async () => {
    const sharedChunk = chunk(
      'build/q-shared.js',
      `function openDB(name) { return 'db:' + name; }\nexport { openDB as t };\n`
    );
    const swChunk = chunk(
      'build/q-sw.js',
      `import { t } from "./q-shared.js";\nself.result = t("test");\n`,
      ['build/q-shared.js']
    );
    const bundle = toBundle(sharedChunk, swChunk);

    await bundleServiceWorkerChunks(bundle, [swChunk]);

    expect(swChunk.code).not.toMatch(/\bimport\b/);
    expect(runAsServiceWorker(swChunk.code).result).toBe('db:test');
    expect(swChunk.imports).toEqual([]);
    expect(bundle['build/q-shared.js']).toBe(sharedChunk);
  });

  test(`GIVEN a service worker chunk with a dynamic import
        THEN the dynamically imported chunk is inlined too`, async () => {
    const lazyChunk = chunk('build/q-lazy.js', `export const value = 42;\n`);
    const swChunk = chunk(
      'build/q-sw.js',
      `self.result = import("./q-lazy.js").then((m) => m.value);\n`,
      [],
      ['build/q-lazy.js']
    );

    await bundleServiceWorkerChunks(toBundle(lazyChunk, swChunk), [swChunk]);

    expect(swChunk.code).not.toMatch(/\bimport\b/);
    await expect(runAsServiceWorker(swChunk.code).result).resolves.toBe(42);
    expect(swChunk.dynamicImports).toEqual([]);
  });

  test(`GIVEN a service worker chunk without imports
        THEN its code is left untouched`, async () => {
    const code = `self.addEventListener("install", () => self.skipWaiting());\n`;
    const swChunk = chunk('service-worker.js', code);

    await bundleServiceWorkerChunks(toBundle(swChunk), [swChunk]);

    expect(swChunk.code).toBe(code);
  });
});

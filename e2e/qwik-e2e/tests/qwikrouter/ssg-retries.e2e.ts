import { expect, test } from '@playwright/test';
import { qwikVite } from '@qwik.dev/core/optimizer';
import { ssgAdapter } from '@qwik.dev/router/adapters/ssg/vite';
import { qwikRouter } from '@qwik.dev/router/vite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createBuilder, type InlineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(__dirname, '../../../../');
const appDir = resolve(repoRoot, 'e2e/qwik-e2e/apps/qwikrouter-ssg-retries');
const distDir = resolve(appDir, 'dist');
const serverDir = resolve(appDir, 'server');

test.describe('router ssg retries', () => {
  // Both tests build into the same `distDir`/`serverDir`, so they must not run in parallel.
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test.skip(({ browserName }) => browserName !== 'chromium', 'Runs once in Chromium e2e.');

  test('fails the build when the route fails and retries are off', async () => {
    await expect(buildFixtureApp({ retries: 0 })).rejects.toThrow(
      'At least one path failed to render'
    );
  });

  test('re-renders a route that failed once when retries are enabled', async () => {
    await buildFixtureApp({ retries: 1 });

    const html = await readFile(resolve(distDir, 'index.html'), 'utf-8');
    expect(html).toContain('rendered after a retry');
  });
});

async function buildFixtureApp({ retries }: { retries: number }) {
  await rm(distDir, { recursive: true, force: true });
  await rm(serverDir, { recursive: true, force: true });
  const markerDir = await mkdtemp(join(tmpdir(), 'qwik-router-ssg-retries-'));
  process.env.SSG_RETRIES_MARKER = join(markerDir, 'failed-once');

  const getConfig = (extra?: InlineConfig): InlineConfig => ({
    root: appDir,
    mode: 'production',
    configFile: false,
    clearScreen: false,
    logLevel: 'error',
    ...extra,
  });

  try {
    await build(
      getConfig({
        plugins: [
          qwikRouter(),
          tsconfigPaths({ root: '.' }),
          qwikVite({ tsOptimizer: true, client: { outDir: distDir } }),
        ],
      })
    );

    const builder = await createBuilder(
      getConfig({
        build: { ssr: true, outDir: serverDir },
        plugins: [
          qwikRouter(),
          tsconfigPaths({ root: '.' }),
          qwikVite({ tsOptimizer: true }),
          ssgAdapter({ origin: 'https://retries.qwik.dev', include: ['/*'], retries }),
        ],
      })
    );
    await builder.buildApp();
  } finally {
    delete process.env.SSG_RETRIES_MARKER;
    await rm(markerDir, { recursive: true, force: true });
  }
}

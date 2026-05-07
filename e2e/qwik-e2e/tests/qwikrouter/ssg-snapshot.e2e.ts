import { expect, test } from '@playwright/test';
import { qwikVite } from '@qwik.dev/core/optimizer';
import type { QwikManifest } from '@qwik.dev/core/optimizer';
import { ssgAdapter } from '@qwik.dev/router/adapters/ssg/vite';
import { qwikRouter } from '@qwik.dev/router/vite';
import compress from 'brotli/compress.js';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type InlineConfig, type PluginOption } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Brotli size budgets for production bundles. These are ceilings, not exact matches: any size
// at or below the budget is fine. Bump the budget intentionally when a real feature justifies
// the growth.
const PRELOADER_BROTLI_BUDGET = 1800; // We currently group the vite preload helper with the preloader, adding ~500bytes brotli.
const CORE_BROTLI_BUDGET = 35000;
const QWIKLOADER_BROTLI_BUDGET = 2000;

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(__dirname, '../../../../');
const appDir = resolve(repoRoot, 'e2e/qwik-e2e/apps/qwikrouter-ssg-snapshot');
const distDir = resolve(appDir, 'dist');
const serverDir = resolve(appDir, 'server');
const expectedHtmlPath = resolve(appDir, 'expected.ssg.html');
const expectedStatePath = resolve(appDir, 'expected.state.txt');

test.describe('router ssg snapshot', () => {
  // All tests share one production build via `beforeAll`. Without `serial`, Playwright's
  // `fullyParallel` config distributes the tests across workers, each re-running the build
  // against the same `serverDir` — that race wipes `run-ssg.js` mid-build and the SSG adapter
  // then fails with "Cannot find module .../server/run-ssg.js".
  test.describe.configure({ mode: 'serial' });

  test.skip(({ browserName }) => browserName !== 'chromium', 'Runs once in Chromium e2e.');

  test.beforeAll(async () => {
    await buildFixtureApp();
  });

  test('build output matches the checked-in normalized html and state dump', async () => {
    const { _dumpState } = await import(resolve(serverDir, 'entry.ssr.js'));

    const html = await readFile(resolve(distDir, 'index.html'), 'utf-8');
    const state = extractState(html);
    expect(state).not.toBeNull();

    const manifestHash = extractManifestHash(html);
    const normalizedHtml = normalizeHtml(html, manifestHash);
    const normalizedState = normalizeStateDump(
      _dumpState(JSON.parse(state!) as unknown[], false, '', null),
      manifestHash
    );

    let expectedHtml = (await readFile(expectedHtmlPath, 'utf-8').catch(() => '')).replace(
      /\r\n/g,
      '\n'
    );
    let expectedState = (await readFile(expectedStatePath, 'utf-8').catch(() => '')).replace(
      /\r\n/g,
      '\n'
    );

    warnIfSizeChanged('readable state dump', expectedState, normalizedState);
    warnIfSizeChanged('HTML', expectedHtml, normalizedHtml);

    if (process.env.UPDATE_SSG_SNAPSHOT === '1') {
      await writeFile(expectedHtmlPath, normalizedHtml, 'utf-8');
      await writeFile(expectedStatePath, normalizedState, 'utf-8');
      expectedHtml = normalizedHtml;
      expectedState = normalizedState;
    }

    expect(normalizedState).toEqual(expectedState);
    expect(normalizedHtml).toEqual(expectedHtml);
  });

  test('preloader chunk brotli size stays within budget', async () => {
    const manifest = JSON.parse(await readFile(resolve(distDir, 'q-manifest.json'), 'utf-8'));
    const preloaderFile = manifest.preloader as string | undefined;
    expect(preloaderFile, 'q-manifest.json should expose `preloader`').toBeTruthy();

    const code = await readFile(resolve(distDir, 'build', preloaderFile!), 'utf-8');
    await checkBrotliBudget('preloader', code, PRELOADER_BROTLI_BUDGET);
  });

  test('core chunk brotli size stays within budget', async () => {
    const manifest = JSON.parse(await readFile(resolve(distDir, 'q-manifest.json'), 'utf-8'));
    const coreFile = manifest.core as string | undefined;
    expect(coreFile, 'q-manifest.json should expose `core`').toBeTruthy();

    const code = await readFile(resolve(distDir, 'build', coreFile!), 'utf-8');
    await checkBrotliBudget('core', code, CORE_BROTLI_BUDGET);
  });

  test('qwikloader chunk brotli size stays within budget', async () => {
    const manifest = JSON.parse(await readFile(resolve(distDir, 'q-manifest.json'), 'utf-8'));
    const qwikLoaderFile = manifest.qwikLoader as string | undefined;
    expect(qwikLoaderFile, 'q-manifest.json should expose `qwikLoader`').toBeTruthy();

    const code = await readFile(resolve(distDir, 'build', qwikLoaderFile!), 'utf-8');
    await checkBrotliBudget('qwikloader', code, QWIKLOADER_BROTLI_BUDGET);
  });
});

/**
 * Brotli size guardrail. The bundle's brotli size must stay at or below `budget`. If it grows past
 * the budget the test fails with the actual size — bump the budget at the top of this file when the
 * growth is expected.
 */
async function checkBrotliBudget(label: string, content: string, budget: number) {
  expect(content.length).toBeGreaterThan(0);
  const brotli = compress(Buffer.from(content), { mode: 1, quality: 11 }).length;
  const pct = ((brotli / budget) * 100).toFixed(1);
  // Logged on every run so size trends are visible in test output without having to fail first.
  // `console.warn` (not `console.log`) because the repo's `no-console` rule allows warn/error only.
  console.warn(`[ssg-snapshot] ${label.padEnd(10)} brotli=${brotli} raw=${content.length}`);
  const constantName = `${label.toUpperCase()}_BROTLI_BUDGET`;
  const overage = brotli - budget;
  expect(
    brotli,
    `${label} bundle is ${brotli} bytes brotli — ${overage} bytes over the ${budget}-byte budget. If this growth is intentional, bump \`${constantName}\` to a higher value.`
  ).toBeLessThanOrEqual(budget);
}

async function buildFixtureApp() {
  await rm(distDir, { recursive: true, force: true });
  await rm(serverDir, { recursive: true, force: true });

  let clientManifest: QwikManifest | undefined;
  const plugins: PluginOption[] = [qwikRouter(), tsconfigPaths({ root: '.' })];

  const getConfig = (extra?: InlineConfig): InlineConfig => ({
    root: appDir,
    mode: 'production',
    configFile: false,
    clearScreen: false,
    logLevel: 'error',
    build: {
      minify: 'terser',
    },
    ...extra,
  });

  await build(
    getConfig({
      plugins: [
        ...plugins,
        qwikVite({
          client: {
            outDir: distDir,
            manifestOutput(manifest) {
              clientManifest = manifest;
            },
          },
        }),
      ],
    })
  );

  await build(
    getConfig({
      build: {
        minify: true,
        ssr: true,
        outDir: serverDir,
      },
      plugins: [
        ...plugins,
        qwikVite({
          ssr: {
            manifestInput: clientManifest,
          },
        }),
        ssgAdapter({
          origin: 'https://snapshot.qwik.dev',
          include: ['/*'],
        }),
      ],
    })
  );
}

function extractManifestHash(html: string): string | null {
  const match = html.match(/q:manifest-hash="([^"]*)"/);
  return match ? match[1] : null;
}

function normalizeHtml(html: string, manifestHash: string | null) {
  let result = html;
  if (manifestHash) {
    result = result.replaceAll(manifestHash, 'MANIFEST_HASH');
  }
  result = result
    .replace(/\r\n/g, '\n')
    .replace(/ q:version="[^"]*"/g, '')
    .replace(/ q:instance="[^"]*"/g, ' q:instance="[instance]"')
    .replace(/\/assets\/[A-Za-z0-9_-]+-bundle-graph\.json/g, '/assets/xxxxxxxx-bundle-graph.json')
    .replace(/q-[A-Za-z0-9_-]+\.(js|css)/g, 'q-xxxxxxxx.$1')
    .replace(/qFuncs_[A-Za-z0-9_-]+/g, 'qFuncs_xxxxxx')
    .replace(/<script type="qwik\/state"[^>]*>[\s\S]*?<\/script>/, '[state omitted]\n')
    .replace(/<script type="qwik\/vnode"[^>]*>[\s\S]*?<\/script>/, '[vnode map omitted]\n');
  return result;
}

function extractState(html: string) {
  const match = html.match(/<script type="qwik\/state"[^>]*>([\s\S]*?)<\/script>/);
  return match ? match[1] : null;
}

function normalizeStateDump(stateDump: string, manifestHash: string | null) {
  let result = stateDump
    .replace(/\r\n/g, '\n')
    .replace(/manifestHash"\n\s+\{string\} "[^"]+"/g, 'manifestHash"\n    {string} "MANIFEST_HASH"')
    .replace(/qFuncs_[A-Za-z0-9_-]+/g, 'qFuncs_xxxxxx')
    .replace(/q-[A-Za-z0-9_-]+\.(js|css)/g, 'q-xxxxxxxx.$1')
    .replaceAll(/RootRef .*/g, 'RootRef [omitted]')
    .replaceAll(/QRL ".*"/g, 'QRL "[omitted]"')
    .replace(/^\(\d+ chars\)$/m, '');
  if (manifestHash) {
    result = result.replaceAll(manifestHash, 'MANIFEST_HASH');
  }
  return result;
}

function warnIfSizeChanged(label: string, expected: string, actual: string) {
  const expectedLen = expected.length;
  const actualLen = actual.length;
  if (expectedLen === 0) {
    return;
  }
  const pct = Math.abs(actualLen - expectedLen) / expectedLen;
  if (pct > 0.01) {
    console.error(
      `\n\n[ssg-snapshot] ${label} size changed by ${(pct * 100).toFixed(1)}%: ` +
        `${expectedLen} → ${actualLen} chars`
    );
  }
}

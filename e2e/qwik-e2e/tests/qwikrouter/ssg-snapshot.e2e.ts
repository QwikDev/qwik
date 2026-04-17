import { expect, test } from '@playwright/test';
import { qwikVite } from '@qwik.dev/core/optimizer';
import type { QwikManifest } from '@qwik.dev/core/optimizer';
import { ssgAdapter } from '@qwik.dev/router/adapters/ssg/vite';
import { qwikRouter } from '@qwik.dev/router/vite';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type InlineConfig, type PluginOption } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(__dirname, '../../../../');
const appDir = resolve(repoRoot, 'e2e/qwik-e2e/apps/qwikrouter-ssg-snapshot');
const distDir = resolve(appDir, 'dist');
const serverDir = resolve(appDir, 'server');
const expectedHtmlPath = resolve(appDir, 'expected.ssg.html');
const expectedStatePath = resolve(appDir, 'expected.state.txt');

test.describe('router ssg snapshot', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Runs once in Chromium e2e.');

  test('build output matches the checked-in normalized html and state dump', async () => {
    await buildFixtureApp();
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
});

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
    build: {
      minify: false,
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
        minify: false,
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

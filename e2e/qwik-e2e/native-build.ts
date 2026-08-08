// Build an e2e app for the Rust SSR host: client bundles + q-manifest.json,
// then an SSR build with `ssrPlan: true` emitting q-ssr-plan.json for qwik-ssr-gen.
/* eslint-disable no-console */

import type { QwikManifest } from '@qwik.dev/core/optimizer';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type InlineConfig } from 'vite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const appName = process.argv[2] ?? 'native-counter';
const appDir = join(__dirname, 'apps', appName);
if (!existsSync(appDir)) {
  console.error(`unknown app: ${appName} (no ${appDir})`);
  process.exit(1);
}
const appSrcDir = join(appDir, 'src');
const distDir = join(appDir, 'dist');
const serverDir = join(appDir, 'server');
const basePath = '/';

async function main() {
  const optimizer = await import('@qwik.dev/core/optimizer');
  rmSync(distDir, { recursive: true, force: true });
  rmSync(serverDir, { recursive: true, force: true });

  let clientManifest: QwikManifest | undefined;
  const getInlineConf = (extra?: InlineConfig): InlineConfig => ({
    root: appDir,
    mode: 'production',
    configFile: false,
    base: basePath,
    ...extra,
    resolve: {
      conditions: ['production'],
      mainFields: [],
    },
  });

  await build(
    getInlineConf({
      build: { minify: true },
      define: { 'globalThis.qDev': false, 'globalThis.qInspector': false },
      plugins: [
        optimizer.qwikVite({
          entryStrategy: { type: 'segment' },
          client: {
            outDir: join(distDir, 'client'),
            manifestOutput(manifest) {
              clientManifest = manifest;
            },
          },
        }),
      ],
    })
  );

  await build(
    getInlineConf({
      build: {
        emitAssets: true,
        minify: true,
        outDir: serverDir,
        ssr: resolve(appSrcDir, 'entry.ssr.tsx'),
      },
      define: { 'globalThis.qDev': false, 'globalThis.qInspector': false },
      plugins: [
        optimizer.qwikVite({
          ssrPlan: true,
          ssr: { manifestInput: clientManifest },
        }),
      ],
    })
  );
  console.log(`${appName} built:`, distDir, serverDir);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

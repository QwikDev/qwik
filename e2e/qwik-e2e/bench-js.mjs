// In-process JS render timing for a built e2e app — the counterpart of
// `qwik-ssr-host --bench`. Build the app first (e2e/qwik-e2e/native-build.ts <app>).
//   node e2e/qwik-e2e/bench-js.mjs vdomless-counter 200
/* eslint-disable no-console */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const appName = process.argv[2] ?? 'vdomless-counter';
const iterations = Number(process.argv[3] ?? 100);
const appDir = join(__dirname, 'apps', appName);

globalThis.QWIK_LOADER_DEFAULT_MINIFIED ??= readFileSync(
  join(repoRoot, 'packages/qwik/dist/qwikloader.js'),
  'utf8'
);
globalThis.QWIK_LOADER_DEFAULT_DEBUG ??= readFileSync(
  join(repoRoot, 'packages/qwik/dist/qwikloader.debug.js'),
  'utf8'
);
const manifest = JSON.parse(readFileSync(join(appDir, 'dist/client/q-manifest.json'), 'utf8'));
const render = (await import(pathToFileURL(join(appDir, 'server/entry.ssr.js')).href)).default;

let bytes = 0;
const renderOnce = async () => {
  await render({
    manifest,
    base: `/${appName}/build/`,
    serverData: { url: 'http://localhost/' },
    stream: {
      write(chunk) {
        bytes += chunk.length;
      },
    },
  });
};

for (let warmup = 0; warmup < 10; warmup++) {
  await renderOnce();
}
const times = [];
for (let iteration = 0; iteration < iterations; iteration++) {
  const start = performance.now();
  await renderOnce();
  times.push(performance.now() - start);
}
times.sort((a, b) => a - b);
const average = times.reduce((sum, time) => sum + time, 0) / iterations;
console.log(
  `${appName}: ${iterations} renders, avg ${average.toFixed(3)}ms, ` +
    `p50 ${times[Math.floor(iterations / 2)].toFixed(3)}ms, ` +
    `p95 ${times[Math.floor((iterations * 95) / 100)].toFixed(3)}ms, ` +
    `${Math.round(bytes / (iterations + 10))} bytes/render`
);

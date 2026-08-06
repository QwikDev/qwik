// `pnpm serve.native [port]` — build every vdomless e2e app (vite → q-ssr-plan.json +
// q-manifest.json), then hand off to `cargo run -p qwik-ssr-host`: build.rs compiles every
// built plan into one multi-app binary and Rust serves everything. Node never serves a request.
/* eslint-disable no-console */

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const appsDir = join(__dirname, 'apps');
const port = process.argv[2] ?? '3310';

const isVdomless = (name: string): boolean => {
  try {
    const pkg = JSON.parse(readFileSync(join(appsDir, name, 'package.json'), 'utf-8'));
    return !!pkg.__qwik__?.vdomless;
  } catch {
    return false;
  }
};
const appNames = readdirSync(appsDir).filter(
  (name) => statSync(join(appsDir, name)).isDirectory() && isVdomless(name)
);

for (const appName of appNames) {
  console.log(`\n🏗️  ${appName}: vite build`);
  const build = spawnSync(
    process.execPath,
    ['--require', './scripts/runBefore.ts', 'e2e/qwik-e2e/native-build.ts', appName],
    { cwd: repoRoot, stdio: 'inherit' }
  );
  if (build.status !== 0) {
    console.error(`❌ ${appName}: vite build failed — it will be missing from the host`);
  }
}

console.log('\n🦀  cargo run -p qwik-ssr-host (node is done — Rust serves from here)\n');
const serve = spawnSync(
  'cargo',
  ['run', '--manifest-path', 'packages/qwik/native/rust/Cargo.toml', '-p', 'qwik-ssr-host', port],
  { cwd: repoRoot, stdio: 'inherit' }
);
process.exit(serve.status ?? 0);

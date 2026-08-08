// `pnpm serve.native [port]` — build every vdomless e2e app (vite → q-ssr-plan.json +
// q-manifest.json), generate a Cargo project from the plans (one crate per app), then run it.
// Rust serves everything; Node never serves a request.
/* eslint-disable no-console */

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const appsDir = join(__dirname, 'apps');
const projectDir = join(__dirname, '.native');
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

// manifests must exist before cargo resolves them, so the project is generated here, not in a build.rs
console.log('\n🏗️  generating the Cargo project (one crate per app)');
const generate = spawnSync(
  'cargo',
  [
    'run',
    '--quiet',
    '--manifest-path',
    'packages/qwik/native/rust/Cargo.toml',
    '-p',
    'qwik-ssr-gen',
    '--bin',
    'qwik-native-project',
    '--',
    appsDir,
    projectDir,
  ],
  { cwd: repoRoot, stdio: 'inherit' }
);
if (generate.status !== 0) {
  process.exit(generate.status ?? 1);
}

console.log('\n🦀  cargo run (node is done — Rust serves from here)\n');
const serve = spawnSync('cargo', ['run', '--manifest-path', join(projectDir, 'Cargo.toml'), port], {
  cwd: repoRoot,
  stdio: 'inherit',
});
process.exit(serve.status ?? 0);

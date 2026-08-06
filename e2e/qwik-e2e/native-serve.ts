// `pnpm serve.native [app] [port]` — vite-build the e2e app, then serve it from the Rust
// SSR host. cargo rebuilds only when the plan bytes change (build.rs rerun-if-changed).
/* eslint-disable no-console */

import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const appName = process.argv[2] ?? 'native-counter';
const port = process.argv[3] ?? '3310';
const appDir = join(__dirname, 'apps', appName);

const buildResult = spawnSync(
  process.execPath,
  ['--require', './scripts/runBefore.ts', 'e2e/qwik-e2e/native-build.ts', appName],
  { cwd: repoRoot, stdio: 'inherit' }
);
if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

const serveResult = spawnSync(
  'cargo',
  ['run', '--manifest-path', 'packages/qwik/native/rust/Cargo.toml', '-p', 'qwik-ssr-host', port],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      QWIK_SSR_PLAN: join(appDir, 'server', 'q-ssr-plan.json'),
      QWIK_CLIENT_DIR: join(appDir, 'dist', 'client'),
    },
  }
);
process.exit(serveResult.status ?? 0);

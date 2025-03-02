// verify that ../qwik/dist/core.d.ts exists or run `pnpm run build.core` in the root directory
// Also make sure that the repl-sw.js file is present, for dev mode
// we need it for development and for the REPL

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

let __dirname = path.dirname(new URL(import.meta.url).pathname);
const isWindows = process.platform === 'win32';
if (isWindows && __dirname.startsWith('/')) {
  // in Windows __dirname starts with a / causing errors
  // before
  //  /C:/Users/{location stuff}/qwik/packages/docs
  __dirname = __dirname.substring(1);
  // after
  // C:/Users/{location stuff}/qwik/packages/docs
}
const qwikPkgDir = path.join(__dirname, '..', 'qwik', 'dist');

if (!fs.existsSync(path.join(qwikPkgDir, 'core.d.ts'))) {
  console.warn(
    `\n\n=== Running 'pnpm run build.local' to generate missing imports for the docs ===\n`
  );
  const out = spawnSync('pnpm', ['run', 'build.local'], {
    cwd: path.join(__dirname, '..', '..'),
    stdio: 'inherit',
  });
  if (out.status !== 0) {
    console.error('Failed to build local packages');
    process.exit(1);
  }
}

if (!fs.existsSync(path.join(__dirname, 'public', 'repl', 'repl-sw.js'))) {
  console.warn(
    `\n\n=== Running 'pnpm run build.repl-sw' to generate missing REPL service worker public/repl/repl-sw.js ===\n`
  );
  const out = spawnSync('pnpm', ['run', 'build.repl-sw'], {
    stdio: 'inherit',
  });
  if (out.status !== 0) {
    console.error('Failed to build REPL service worker');
    process.exit(1);
  }
}

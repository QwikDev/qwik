// verify that ../qwik/dist/core.d.ts exists or run `pnpm run build.core` in the root directory
// we need it for development and for the REPL
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
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

if (!fs.existsSync(path.join(__dirname, 'dist', 'repl', '~repl-server-host.js'))) {
  console.warn(
    `\n\n=== Running 'pnpm run build.client' to generate missing REPL service worker dist/repl/~repl-server-host.js ===\n`
  );
  const out = spawnSync('pnpm', ['run', 'build.client'], {
    stdio: 'inherit',
  });
  if (out.status !== 0) {
    console.error('Failed to build REPL service worker');
    process.exit(1);
  }
}

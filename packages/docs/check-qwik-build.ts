// Verify that the local Qwik build exists.
// Docs dev mode also needs the fast dev-flavored core build, not a production `build.core` output.
// Also make sure that the repl-sw.js file is present, for dev mode we need it for the REPL.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';

let __dirname = path.dirname(fileURLToPath(import.meta.url));
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
const qwikCoreProdPath = path.join(qwikPkgDir, 'core.prod.mjs');

const runRootBuild = (script: string, reason: string) => {
  console.warn(`\n\n=== Running 'pnpm run ${script}' ${reason} ===\n`);
  const out = spawnSync('pnpm', ['run', script], {
    cwd: path.join(__dirname, '..', '..'),
    stdio: 'inherit',
  });
  if (out.status !== 0) {
    console.error(`Failed to run ${script}`);
    process.exit(1);
  }
};

const hasDevCoreBuild = () => {
  if (!fs.existsSync(qwikCoreProdPath)) {
    return false;
  }
  const coreProd = fs.readFileSync(qwikCoreProdPath, 'utf-8');
  return coreProd.includes(`export * from './core.mjs';`);
};

if (!fs.existsSync(path.join(qwikPkgDir, 'core-internal.d.ts'))) {
  runRootBuild('build.local', 'to generate missing imports for the docs');
}

if (!hasDevCoreBuild()) {
  runRootBuild('build.core.dev', 'to refresh the local Qwik dev build used by docs');
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

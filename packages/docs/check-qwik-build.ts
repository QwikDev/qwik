// verify that ../qwik/dist/core.d.ts exists or run `pnpm run build.core` in the root directory
// we need it for development and for the REPL
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const coreDtsPath = path.join(__dirname, '../qwik/dist/core.d.ts');
if (!fs.existsSync(coreDtsPath)) {
  console.warn(
    `Missing ${coreDtsPath}. Running 'pnpm run build.core' in the root directory to generate it.`
  );
  // now run `pnpm run build.core` in the root directory
  spawnSync('pnpm', ['run', 'build.core'], {
    cwd: path.join(__dirname, '../..'),
    stdio: 'inherit',
  });
}

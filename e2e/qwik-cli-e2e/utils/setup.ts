import { execSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { workspaceRoot } from '.';

const packageCfg = {
  '@qwik.dev/core': {
    packagePath: 'packages/qwik',
    distPath: 'packages/qwik/dist',
  },
  '@qwik.dev/router': {
    packagePath: 'packages/qwik-router',
    distPath: 'packages/qwik-router/lib',
  },
  'eslint-plugin-qwik': {
    packagePath: 'packages/eslint-plugin-qwik',
    distPath: 'packages/eslint-plugin-qwik/dist',
  },
};
function ensurePackageBuilt() {
  for (const [name, cfg] of Object.entries(packageCfg)) {
    if (!existsSync(join(workspaceRoot, cfg.distPath))) {
      throw new Error(`Looks like package "${name}" has not been built yet.`);
    }
  }
}
function packPackages() {
  const tarballPaths: { name: string; absolutePath: string }[] = [];
  const tarballOutDir = join(workspaceRoot, 'temp', 'tarballs');
  for (const [name, cfg] of Object.entries(packageCfg)) {
    const out = execSync(`pnpm pack --json --pack-destination=${tarballOutDir}`, {
      cwd: join(workspaceRoot, cfg.packagePath),
      encoding: 'utf-8',
    });
    const json = JSON.parse(out);
    tarballPaths.push({ name, absolutePath: json.filename });
  }
  writeFileSync(join(tarballOutDir, 'paths.json'), JSON.stringify(tarballPaths));
}

ensurePackageBuilt();
packPackages();

import { execSync } from 'child_process';
import { join } from 'path';
import { workspaceRoot } from '.';
import { existsSync, writeFileSync } from 'fs';

const packageCfg = {
  '@builder.io/qwik': {
    packagePath: 'packages/qwik',
    distPath: 'packages/qwik/dist',
  },
  '@builder.io/qwik-city': {
    packagePath: 'packages/qwik-city',
    distPath: 'packages/qwik-city/lib',
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
    const out = execSync(`pnpm pack --pack-destination=${tarballOutDir}`, {
      cwd: join(workspaceRoot, cfg.packagePath),
      encoding: 'utf-8',
    });
    tarballPaths.push({ name, absolutePath: out.replace(/(\r\n|\n|\r)/gm, '') });
  }
  writeFileSync(join(tarballOutDir, 'paths.json'), JSON.stringify(tarballPaths));
}

ensurePackageBuilt();
packPackages();

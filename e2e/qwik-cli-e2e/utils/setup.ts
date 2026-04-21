import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { workspaceRoot } from '.';

const OPTIMIZER_PACKAGE = '@qwik.dev/optimizer';
const CORE_PACKAGE = '@qwik.dev/core';
const corePackagePath = join(workspaceRoot, 'packages/qwik/package.json');

const packageCfg: Record<string, { packagePath: string; distPath: string }> = {
  '@qwik.dev/optimizer': {
    packagePath: 'packages/optimizer',
    distPath: 'packages/optimizer/dist',
  },
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
  const originalCorePackageJson = readFileSync(corePackagePath, 'utf-8');

  try {
    for (const [name, cfg] of Object.entries(packageCfg)) {
      if (name === CORE_PACKAGE) {
        const optimizerTarball = tarballPaths.find((pkg) => pkg.name === OPTIMIZER_PACKAGE);
        if (!optimizerTarball) {
          throw new Error(`Missing packed ${OPTIMIZER_PACKAGE} package.`);
        }
        updateCoreOptimizerDependency(optimizerTarball.absolutePath);
      }

      tarballPaths.push({
        name,
        absolutePath: packPackage(join(workspaceRoot, cfg.packagePath), tarballOutDir),
      });
    }
  } finally {
    writeFileSync(corePackagePath, originalCorePackageJson);
  }

  writeFileSync(join(tarballOutDir, 'paths.json'), JSON.stringify(tarballPaths));
}

function packPackage(packagePath: string, tarballOutDir: string) {
  const out = execSync(`pnpm pack --json --pack-destination=${tarballOutDir}`, {
    cwd: packagePath,
    encoding: 'utf-8',
  });
  const json = JSON.parse(out);
  return json.filename;
}

function updateCoreOptimizerDependency(optimizerTarballPath: string) {
  const packageJson = JSON.parse(readFileSync(corePackagePath, 'utf-8'));
  packageJson.dependencies = {
    ...packageJson.dependencies,
    [OPTIMIZER_PACKAGE]: `file:${optimizerTarballPath.replace(/\\/g, '/')}`,
  };
  writeFileSync(corePackagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

ensurePackageBuilt();
packPackages();

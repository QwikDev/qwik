import fs from 'fs';
import { join } from 'path';
import color from 'kleur';
import detectPackageManager from 'which-pm-runs';
import type { PackageJSON } from '../../../../scripts/util';

export async function readPackageJson(dir: string) {
  const path = join(dir, 'package.json');
  const pkgJson: PackageJSON = JSON.parse(await fs.promises.readFile(path, 'utf-8'));
  return pkgJson;
}

export async function writePackageJson(dir: string, pkgJson: PackageJSON) {
  const path = join(dir, 'package.json');
  await fs.promises.writeFile(path, JSON.stringify(pkgJson, null, 2) + '\n');
}

export function cleanPackageJson(srcPkg: any) {
  srcPkg = { ...srcPkg };

  const cleanedPkg: any = {
    name: srcPkg.name,
    version: srcPkg.version,
    description: srcPkg.description,
    scripts: srcPkg.scripts,
    dependencies: srcPkg.dependencies,
    devDependencies: srcPkg.devDependencies,
  };

  Object.keys(cleanedPkg).forEach((prop) => {
    delete (srcPkg as any)[prop];
  });
  delete srcPkg.__qwik__;

  const sortedKeys = Object.keys(srcPkg).sort();
  for (const key of sortedKeys) {
    cleanedPkg[key] = (srcPkg as any)[key];
  }

  return cleanedPkg;
}

export function toDashCase(str: string) {
  return str.toLocaleLowerCase().replace(/ /g, '-');
}

export function getPackageManager() {
  return detectPackageManager()?.name || 'npm';
}

export function panic(msg: string) {
  console.error(`\n❌ ${color.red(msg)}\n`);
  process.exit(1);
}

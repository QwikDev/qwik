import fs from 'node:fs';
import { join } from 'node:path';
import color from 'kleur';
import detectPackageManager from 'which-pm-runs';
import type { IntegrationPackageJson } from '../types';

export async function readPackageJson(dir: string) {
  const path = join(dir, 'package.json');
  const pkgJson: IntegrationPackageJson = JSON.parse(await fs.promises.readFile(path, 'utf-8'));
  return pkgJson;
}

export async function writePackageJson(dir: string, pkgJson: IntegrationPackageJson) {
  const path = join(dir, 'package.json');
  await fs.promises.writeFile(path, JSON.stringify(pkgJson, null, 2) + '\n');
}

export function cleanPackageJson(srcPkg: IntegrationPackageJson) {
  srcPkg = { ...srcPkg };

  const cleanedPkg: IntegrationPackageJson = {
    name: srcPkg.name,
    version: srcPkg.version,
    description: srcPkg.description,
    scripts: srcPkg.scripts,
    dependencies: srcPkg.dependencies,
    devDependencies: srcPkg.devDependencies,
    main: srcPkg.main,
    qwik: srcPkg.qwik,
    module: srcPkg.module,
    types: srcPkg.types,
    exports: srcPkg.exports,
    files: srcPkg.files,
    engines: { node: '>=15.0.0' },
  };

  Object.keys(cleanedPkg).forEach((prop) => {
    delete (srcPkg as any)[prop];
  });
  delete srcPkg.__qwik__;

  const sortedKeys = Object.keys(srcPkg).sort();
  for (const key of sortedKeys) {
    (cleanedPkg as any)[key] = (srcPkg as any)[key];
  }

  return cleanedPkg;
}

export function dashToTitlelCase(str: string) {
  return str
    .toLocaleLowerCase()
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function toDashCase(str: string) {
  return str.toLocaleLowerCase().replace(/ /g, '-');
}

export function getPackageManager() {
  return detectPackageManager()?.name || 'npm';
}

export function pmRunCmd() {
  const pm = getPackageManager();
  if (pm !== 'npm') {
    return pm;
  }
  return `${pm} run`;
}

export function panic(msg: string) {
  console.error(`\n❌ ${color.red(msg)}\n`);
  process.exit(1);
}

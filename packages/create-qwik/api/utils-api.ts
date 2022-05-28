import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { PackageJSON } from '../../../scripts/util';

export type Replacements = [RegExp, string][];

export function cp(srcDir: string, destDir: string, replacements: Replacements) {
  const items = readdirSync(srcDir);
  for (const itemName of items) {
    const destName = itemName === 'gitignore' ? '.gitignore' : itemName;
    const srcChildPath = join(srcDir, itemName);
    const destChildPath = join(destDir, destName);
    const s = statSync(srcChildPath);
    if (s.isDirectory()) {
      mkdirSync(destChildPath, { recursive: true });
      cp(srcChildPath, destChildPath, replacements);
    } else if (s.isFile()) {
      const shouldReplace =
        replacements.length > 0 &&
        ['.json', '.toml', '.md', '.html', 'vite.config.ts'].some((ext) =>
          srcChildPath.endsWith(ext)
        );
      if (shouldReplace) {
        let srcContent = readFileSync(srcChildPath, 'utf8');
        for (const regex of replacements) {
          srcContent = srcContent.replace(regex[0], regex[1]);
        }
        writeFileSync(destChildPath, srcContent);
      } else {
        copyFileSync(srcChildPath, destChildPath);
      }
    }
  }
}

export function readPackageJson(dir: string) {
  const path = join(dir, 'package.json');
  const pkgJson: PackageJSON = JSON.parse(readFileSync(path, 'utf-8'));
  return pkgJson;
}

export function writePackageJson(dir: string, pkgJson: PackageJSON) {
  const path = join(dir, 'package.json');
  writeFileSync(path, JSON.stringify(pkgJson, null, 2) + '\n');
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

export function mergePackageJSONs(a: any, b: any) {
  const props = ['scripts', 'dependencies', 'devDependencies'];
  props.forEach((prop) => {
    mergeSort(a, b, prop);
  });
}

function mergeSort(a: any, b: any, prop: string) {
  if (b[prop]) {
    if (a[prop]) {
      Object.assign(a[prop], { ...b[prop] });
    } else {
      a[prop] = { ...b[prop] };
    }

    const sorted: any = {};
    const keys = Object.keys(a[prop]).sort();
    for (const key of keys) {
      sorted[key] = a[prop][key];
    }
    a[prop] = sorted;
  }
}

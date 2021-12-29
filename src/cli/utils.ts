import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs';
import color from 'kleur';
import { join, resolve } from 'path';
import type { PackageJSON } from 'scripts/util';
import { extname } from 'src/core/util/path';

export function panic(msg: string) {
  console.error(`\n❌ ${color.red(msg)}\n`);
  process.exit(1);
}

export function validateOutDir(outDir: string) {
  if (existsSync(outDir)) {
    panic(
      `Directory "${outDir}" already exists. Please either remove this directory, or choose another location.`
    );
  }
}

export function createOutDirName(projectName: string) {
  return projectName.toLocaleLowerCase().replace(/ /g, '-');
}

export function createOutDir(outDirName: string) {
  return resolve(process.cwd(), outDirName);
}

export type Replacements = [RegExp, string][];

export function cp(srcDir: string, destDir: string, replacements: Replacements) {
  const items = readdirSync(srcDir);
  for (const itemName of items) {
    const srcChildPath = join(srcDir, itemName);
    const destChildPath = join(destDir, itemName);
    const s = statSync(srcChildPath);
    if (s.isDirectory()) {
      mkdirSync(destChildPath, { recursive: true });
      cp(srcChildPath, destChildPath, replacements);
    } else if (s.isFile()) {
      const shouldReplace =
        replacements.length > 0 &&
        ['.json', '.toml', '.md', '.html'].includes(extname(srcChildPath));
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

export function mergeSort(a: any, b: any, prop: string) {
  if (b[prop]) {
    if (a[prop]) {
      Object.assign(a[prop], b[prop]);
    } else {
      a[prop] = b[prop];
    }

    const sorted: any = {};
    const keys = Object.keys(a[prop]).sort();
    for (const key of keys) {
      sorted[key] = a[prop][key];
    }
    a[prop] = sorted;
  }
}

export function writeToCwd() {
  return isStackBlitz();
}

function isStackBlitz() {
  try {
    // /home/projects/abc123
    return process.cwd().startsWith('/home/projects/');
  } catch (e) {
    /**/
  }
  return false;
}

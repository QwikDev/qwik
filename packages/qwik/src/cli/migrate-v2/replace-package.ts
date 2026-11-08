import { basename } from 'path';
import { isBinaryPath } from './tools/binary-extensions';
import { visitNotIgnoredFiles } from './tools/visit-not-ignored-files';
import { readFileSync, writeFileSync } from 'fs';
import { log } from '@clack/prompts';

function updateFileContent(path: string, content: string) {
  writeFileSync(path, content);
  log.info(`"${path}" has been updated`);
}

export function replacePackage(
  oldPackageName: string,
  newPackageName: string,
  skipDependencies = false
): void {
  if (!skipDependencies) {
    replacePackageInDependencies(oldPackageName, newPackageName);
  }

  replaceMentions(oldPackageName, newPackageName);
}

/** Removes a package from the dependencies of every package.json. */
export function removePackage(packageName: string) {
  updatePackageJsons((deps) => packageName in deps && delete deps[packageName]);
}

function replacePackageInDependencies(oldPackageName: string, newPackageName: string) {
  updatePackageJsons((deps) => {
    if (!(oldPackageName in deps)) {
      return false;
    }
    // We keep the old version intentionally. It will be updated later within another step of the migration.
    deps[newPackageName] = deps[oldPackageName];
    return delete deps[oldPackageName];
  });
}

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

/**
 * Calls `update` with every dependency list of every package.json and writes the files where it
 * returned `true`.
 */
export function updatePackageJsons(update: (deps: Record<string, string>) => boolean) {
  visitNotIgnoredFiles('.', (path) => {
    if (basename(path) !== 'package.json') {
      return;
    }
    try {
      const packageJson = JSON.parse(readFileSync(path, 'utf-8'));
      let changed = false;
      for (const field of DEPENDENCY_FIELDS) {
        if (packageJson[field]) {
          changed = update(packageJson[field]) || changed;
        }
      }
      if (changed) {
        updateFileContent(path, JSON.stringify(packageJson, null, 2) + '\n');
      }
    } catch {
      log.warn(`Could not update the dependencies in ${path}.`);
    }
  });
}

function replaceMentions(oldPackageName: string, newPackageName: string) {
  visitNotIgnoredFiles('.', (path) => {
    if (isBinaryPath(path)) {
      return;
    }

    const ignoredFiles = [
      'yarn.lock',
      'package-lock.json',
      'pnpm-lock.yaml',
      'bun.lockb',
      'CHANGELOG.md',
    ];
    if (ignoredFiles.includes(basename(path))) {
      return;
    }

    try {
      const contents = readFileSync(path, 'utf-8');

      const newContents = contents.replace(packageNameRegExp(oldPackageName), newPackageName);
      if (newContents === contents) {
        return;
      }

      updateFileContent(path, newContents);
    } catch {
      // Its **probably** ok, contents can be null if the file is too large or
      // there was an access exception.
      log.warn(
        `An error was thrown when trying to update ${path}. If you believe the migration should have updated it, be sure to review the file and open an issue.`
      );
    }
  });
}

/**
 * Matches the package name (and its subpaths) but not other packages that share its prefix, e.g.
 * `@builder.io/qwik` must not match `@builder.io/qwik-labs`.
 */
function packageNameRegExp(packageName: string) {
  return new RegExp(packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])', 'g');
}

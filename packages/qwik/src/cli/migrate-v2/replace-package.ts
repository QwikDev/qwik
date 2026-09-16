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

function replacePackageInDependencies(oldPackageName: string, newPackageName: string) {
  visitNotIgnoredFiles('.', (path) => {
    if (basename(path) !== 'package.json') {
      return;
    }

    try {
      const packageJson = JSON.parse(readFileSync(path, 'utf-8'));
      for (const deps of [
        packageJson.dependencies ?? {},
        packageJson.devDependencies ?? {},
        packageJson.peerDependencies ?? {},
        packageJson.optionalDependencies ?? {},
      ]) {
        if (oldPackageName in deps) {
          // We keep the old version intentionally. It will be updated later within another step of the migration.
          deps[newPackageName] = deps[oldPackageName];
          delete deps[oldPackageName];
        }
      }
      updateFileContent(path, JSON.stringify(packageJson, null, 2));
    } catch (e) {
      console.warn(`Could not replace ${oldPackageName} with ${newPackageName} in ${path}.`);
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

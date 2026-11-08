import { readFileSync, realpathSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { visitNotIgnoredFiles } from './visit-not-ignored-files';

type PackageJson = Record<string, Record<string, string> | undefined>;

/** The packages the migration replaces, they are not libraries of the app. */
const MIGRATED_PACKAGES = new Set([
  '@builder.io/qwik',
  '@builder.io/qwik-city',
  '@builder.io/qwik-react',
  '@builder.io/qwik-labs',
  'eslint-plugin-qwik',
]);

const readPackageJson = (dir: string): PackageJson | undefined => {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
  } catch {
    return undefined;
  }
};

/** `dir` and its parents, so the dependencies of a monorepo root count too. */
const selfAndParents = (dir: string) => {
  const dirs = [dir];
  while (dirname(dir) !== dir) {
    dir = dirname(dir);
    dirs.push(dir);
  }
  return dirs;
};

const mentions = (json: PackageJson, name: string) =>
  !!(json.dependencies?.[name] || json.peerDependencies?.[name] || json.devDependencies?.[name]);

/** The dependencies of the app in `dir` built with Qwik 1, detected like the Vite plugin does. */
export const findV1Libraries = (dir: string) => {
  dir = resolve(dir);
  const names = new Set(
    selfAndParents(dir).flatMap((d) => {
      const json = readPackageJson(d);
      return ['dependencies', 'devDependencies', 'optionalDependencies'].flatMap((field) =>
        Object.keys(json?.[field] ?? {})
      );
    })
  );
  return [...names].filter((name) => {
    if (MIGRATED_PACKAGES.has(name)) {
      return false;
    }
    for (const parent of selfAndParents(dir)) {
      const json = readPackageJson(join(parent, 'node_modules', name));
      if (json) {
        // workspace packages are migrated too
        const isInstalled = /[\\/]node_modules[\\/]/.test(
          realpathSync(join(parent, 'node_modules', name))
        );
        return (
          isInstalled && mentions(json, '@builder.io/qwik') && !mentions(json, '@qwik.dev/core')
        );
      }
    }
    return false;
  });
};

/** Whether a package of the project depends on a library built with Qwik 1. */
export const hasV1Libraries = () => {
  let found = false;
  visitNotIgnoredFiles('.', (path) => {
    found ||= basename(path) === 'package.json' && findV1Libraries(dirname(path)).length > 0;
  });
  return found;
};

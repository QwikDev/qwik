import { execSync } from 'node:child_process';
import { updatePackageJsons } from './replace-package';
import { installDeps } from '../utils/install-deps';
import { getPackageManager, readPackageJson, writePackageJson } from './../utils/utils';
import { packageNames, versionTagPriority } from './versions';
import { major, minVersion, validRange } from 'semver';
import { log, spinner } from '@clack/prompts';

export async function updateDependencies() {
  const version = getPackageTag();

  // workspace packages too, not only the root package.json
  updatePackageJsons((deps) => {
    let changed = false;
    for (const name of Object.keys(deps)) {
      const newVersion = packageNames.includes(name) ? version : toolingVersion(name, deps[name]);
      if (newVersion && deps[name] !== newVersion) {
        deps[name] = newVersion;
        changed = true;
      }
    }
    return changed;
  });

  const loading = spinner();
  loading.start(`Updating dependencies...`);
  await runInstall();
  loading.stop('Dependencies have been updated');
}

/** V2 requires Vite 8 (Rolldown), Vitest supports Vite 8 since v4. */
function toolingVersion(name: string, range: string) {
  const current = validRange(range) && minVersion(range);
  if (!current) {
    return;
  }
  if (name === 'vite' && major(current) < 8) {
    return '^8.0.0';
  }
  if ((name === 'vitest' || name.startsWith('@vitest/')) && major(current) < 4) {
    return '^4.0.0';
  }
}

/**
 * Resolve the list of available package tags for the "@qwik.dev/core" and get the best match of
 * ^2.0.0 based on the "versionTagPriority"
 */
function getPackageTag() {
  // we assume all migrated packages have the same set of tags
  const tags: [tag: string, version: string][] = execSync('npm dist-tag @qwik.dev/core', {
    encoding: 'utf-8',
  })
    ?.split('\n')
    .filter(Boolean)
    .map((data) =>
      data
        .split(':')
        .map((v) => v?.trim())
        .filter(Boolean)
    )
    .filter((v): v is [string, string] => v.length === 2)
    .sort((a, b) => {
      let aIndex = versionTagPriority.indexOf(a[0]);
      let bIndex = versionTagPriority.indexOf(b[0]);
      if (aIndex === -1) {
        aIndex = Infinity;
      } else if (bIndex === -1) {
        bIndex = Infinity;
      }
      return aIndex - bIndex;
    });

  for (const [, version] of tags) {
    if (major(version) === 2) {
      return version;
    }
  }
  log.warn('Failed to resolve the Qwik version tag, version "2.0.0" will be installed');
  return '2.0.0';
}

export async function installTsMorph() {
  const packageJson = await readPackageJson(process.cwd());
  if (packageJson.dependencies?.['ts-morph'] || packageJson.devDependencies?.['ts-morph']) {
    return false;
  }
  const loading = spinner();
  loading.start('Fetching migration tools..');
  (packageJson.devDependencies ??= {})['ts-morph'] = '23';
  await writePackageJson(process.cwd(), packageJson);
  await runInstall();
  loading.stop('Migration tools have been loaded');
  return true;
}

async function runInstall() {
  const { install } = installDeps(getPackageManager(), process.cwd());
  const passed = await install;
  if (!passed) {
    throw new Error('Failed to install dependencies');
  }
}

export async function removeTsMorphFromPackageJson() {
  const packageJson = await readPackageJson(process.cwd());
  delete packageJson.dependencies?.['ts-morph'];
  delete packageJson.devDependencies?.['ts-morph'];
  await writePackageJson(process.cwd(), packageJson);
}

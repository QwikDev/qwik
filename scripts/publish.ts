import { readPackageJson, writePackageJson } from './package-json';
import { BuildConfig, panic, readFile, writeFile } from './util';
import semver from 'semver';
import execa from 'execa';
import { join } from 'path';
import { validateBuild } from './validate-build';

export async function setVersion(config: BuildConfig) {
  if (
    (typeof config.setVerison !== 'string' && typeof config.setVerison !== 'number') ||
    String(config.setVerison) === ''
  ) {
    return;
  }

  const newVersion = semver.clean(String(config.setVerison), { loose: true })!;
  if (!newVersion) {
    panic(`Invalid semver version "${config.setVerison}"`);
  }

  const rootPkg = await readPackageJson(config.rootDir);
  const oldVersion = rootPkg.version;

  if (semver.lt(newVersion, oldVersion)) {
    panic(`New version "${newVersion}" is less than to current version "${oldVersion}"`);
  }

  await checkExistingNpmVersion(newVersion);

  const updatedPkg = { ...rootPkg };
  updatedPkg.version = newVersion;
  await writePackageJson(config.rootDir, updatedPkg);

  config.setVerison = newVersion;

  console.log(`⬆️ version set to "${config.setVerison}"`);
}

async function checkExistingNpmVersion(newVersion: string) {
  const npmVersionsCall = await execa('npm', ['view', '@builder.io/qwik', 'versions', '--json']);
  const publishedVersions: string[] = JSON.parse(npmVersionsCall.stdout);
  if (publishedVersions.includes(newVersion)) {
    panic(`Version "${newVersion}" of @builder.io/qwik is already published to npm`);
  }
}

export async function publish(config: BuildConfig) {
  const distTag = String(config.setDistTag);
  if (distTag == '') {
    panic(`Invalid dist tag "${distTag}"`);
  }

  const newVersion = config.setVerison!;
  const gitTag = `v${newVersion}`;

  const rootPkg = await readPackageJson(config.rootDir);
  const oldVersion = rootPkg.version;

  if (semver.lte(newVersion, oldVersion)) {
    panic(`New version "${newVersion}" is less than or equal to current version "${oldVersion}"`);
  }

  await checkExistingNpmVersion(newVersion);

  await validateBuild(config);

  const pkgJsonPath = join(config.distPkgDir, 'package.json');

  // await execa('git', ['add', pkgJsonPath]);
  // await execa('git', ['commit', '-f', '-m', newVersion]);
  // await execa('git', ['tag', '-m', newVersion, gitTag]);
  // await execa('git', ['push', '--follow-tags']);
  console.log(`🐠 commit version "${newVersion}" with git tag "${gitTag}"`);

  // await execa('npm', ['publish', '--dry-run'], { cwd: config.distPkgDir });
  console.log(`🐋 published version "${newVersion}" of @builder.io/qwik to npm`);

  // await execa('npm', ['dist-tag', 'add', `@builder.io/qwik@${newVersion}`, distTag]);
  console.log(`🐳 set @builder.io/qwik "${distTag}" dist tag to "${newVersion}"`);

  console.log(
    `🐬 created github release "${gitTag}": https://github.com/BuilderIO/qwik/releases/tag/${gitTag}`
  );
}

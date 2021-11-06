import { readPackageJson, writePackageJson } from './package-json';
import { BuildConfig, panic, readFile, writeFile } from './util';
import semver from 'semver';
import execa from 'execa';
import { join } from 'path';

export async function setVersion(config: BuildConfig) {
  if (typeof config.setVerison !== 'string' && typeof config.setVerison !== 'number') {
    return;
  }

  const newVersion = semver.clean(String(config.setVerison), { loose: true })!;
  if (!newVersion) {
    panic(`Invalid semver version "${config.setVerison}"`);
  }

  const rootPkg = await readPackageJson(config.rootDir);
  const oldVersion = rootPkg.version;

  if (semver.eq(newVersion, oldVersion)) {
    return;
  }

  if (semver.lt(newVersion, oldVersion)) {
    panic(`New version "${newVersion}" is less than current version "${oldVersion}"`);
  }

  await validateDistTag(config);

  const { stdout: gitStatus } = await execa('git', ['status', '--porcelain']);
  if (gitStatus !== '') {
    panic(`Unclean git working tree. Commit changes before setting the package version.`);
  }

  const npmVersionsCall = await execa('npm', ['view', rootPkg.name, 'versions', '--json']);
  const publishedVersions: string[] = JSON.parse(npmVersionsCall.stdout);
  if (publishedVersions.includes(newVersion)) {
    panic(`Version "${newVersion}" is already published to npm for ${rootPkg.name}`);
  }

  const updatedPkg = { ...rootPkg };
  updatedPkg.version = newVersion;

  await writePackageJson(config.rootDir, updatedPkg);

  const cargoTomlPath = await setCargoVersion(config, newVersion);

  await execa('git', ['add', config.rootDir]);
  await execa('git', ['add', cargoTomlPath]);
  await execa('git', ['commit', '-f', '-m', newVersion]);

  const gitCommitTag = `v${newVersion}`;
  await execa('git', ['tag', '-m', newVersion, gitCommitTag]);

  await execa('git', ['push', '--follow-tags']);

  console.log(`🐱 version set to "${newVersion}", git tag "${gitCommitTag}"`);
}

async function setCargoVersion(config: BuildConfig, newVersion: string) {
  const cargoTomlTemplatePath = join(config.srcDir, 'napi', 'Cargo.toml.template');
  const cargoTomlPath = join(config.srcDir, 'napi', 'Cargo.toml');
  const cargoTomlTemplate = await readFile(cargoTomlTemplatePath, 'utf-8');
  const cargoToml = cargoTomlTemplate.replace(`"0.0.0"`, `"${newVersion}"`);

  await writeFile(cargoTomlPath, cargoToml);

  return cargoTomlPath;
}

async function validateDistTag(config: BuildConfig) {
  const { stdout } = await execa('npm', ['view', '--json', '@builder.io/qwik', 'dist-tags']);
  const validTags = new Set([...Object.keys(JSON.parse(stdout)), 'latest', 'dev', 'next']);

  const distTag = String(config.validateDistTag);
  if (!validTags.has(distTag)) {
    panic(`Invalid npm dist-tag "${distTag}". Can only `);
  }

  const { stdout: gitStatus } = await execa('git', ['status', '--porcelain']);
  if (gitStatus !== '') {
    panic(`Unclean git working tree. Commit changes before setting the package version.`);
  }
}

export function publish() {}

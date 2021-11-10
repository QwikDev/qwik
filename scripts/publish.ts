import { readPackageJson, writePackageJson } from './package-json';
import { BuildConfig, PackageJSON, panic, writeFile } from './util';
import semver from 'semver';
import execa from 'execa';
import { join } from 'path';
import { validateBuild } from './validate-build';

export async function setVersion(config: BuildConfig) {
  const rootPkg = await readPackageJson(config.rootDir);
  config.distVersion = rootPkg.version;

  if (
    (typeof config.setVerison !== 'string' && typeof config.setVerison !== 'number') ||
    String(config.setVerison) === ''
  ) {
    config.setVerison = undefined;
    config.distVersion = generateDevVersion(rootPkg.version);
    return;
  }

  const distTag = String(config.setDistTag);
  if (distTag === '' && !config.dryRun) {
    panic(`Invalid npm dist tag "${distTag}"`);
  }

  const newVersion = semver.clean(String(config.setVerison), { loose: true })!;
  if (!newVersion) {
    panic(`Invalid semver version "${config.setVerison}"`);
  }

  if (semver.lte(newVersion, rootPkg.version)) {
    panic(
      `New version "${newVersion}" is less than or equal to current version "${rootPkg.version}"`
    );
  }

  await checkExistingNpmVersion(rootPkg, newVersion);

  const updatedPkg = { ...rootPkg };
  updatedPkg.version = newVersion;
  await writePackageJson(config.rootDir, updatedPkg);

  config.distVersion = newVersion;

  console.log(`⬆️ version set to "${config.distVersion}", dist tag set to "${distTag}"`);
}

export async function publish(config: BuildConfig) {
  const isDryRun = true || !!config.dryRun;

  const distPkg = await readPackageJson(config.distPkgDir);
  const version = distPkg.version;
  const gitTag = `v${version}`;
  const distTag = String(config.setDistTag) || 'dryrun';

  console.log(`🚢 publishing ${version}`, isDryRun ? '(dry-run)' : '');

  const pkgTarName = `builder.io-qwik-${version}.tgz`;
  await execa('npm', ['pack'], { cwd: config.distPkgDir });
  await execa('mv', [pkgTarName, '../'], { cwd: config.distPkgDir });

  if (!isDryRun) {
    await checkExistingNpmVersion(distPkg, version);
  }

  await validateBuild(config);

  await execa('yarn', ['changelog']);

  const actor = process.env.GITHUB_ACTOR || 'builderbot';
  const actorEmail = `${actor}@users.noreply.github.com`;
  await run('git', ['config', 'user.email', `"${actorEmail}"`], isDryRun);
  await run('git', ['config', 'user.name', `"${actor}"`], isDryRun);

  const pkgJsonPath = join(config.rootDir, 'package.json');
  const gitAddArgs = ['add', pkgJsonPath];
  await run('git', gitAddArgs, isDryRun);

  const gitCommitTitle = `"${version}"`;
  const gitCommitBody = `"skip ci"`;
  const gitCommitArgs = ['commit', '-m', gitCommitTitle, '-m', gitCommitBody];
  await run('git', gitCommitArgs, isDryRun);

  const gitTagArgs = ['tag', '-f', '-m', version, gitTag];
  await run('git', gitTagArgs, isDryRun);

  const gitPushArgs = ['push', '--follow-tags'];
  await run('git', gitPushArgs, isDryRun);

  console.log(
    `🐳 commit version "${version}" with git tag "${gitTag}"`,
    isDryRun ? '(dry-run)' : ''
  );

  const npmPublishArgs = ['publish', '--tag', distTag, '--access', 'public'];
  if (isDryRun) {
    npmPublishArgs.push('--dry-run');
  }
  await execa('npm', npmPublishArgs, { cwd: config.distPkgDir });

  console.log(
    `🐋 published version "${version}" of ${distPkg.name} with dist-tag "${distTag}" to npm`,
    isDryRun ? '(dry-run)' : ''
  );
}

async function run(cmd: string, args: string[], isDryRun: boolean) {
  console.log(`  ${cmd} ${args.join(' ')}`, isDryRun ? '(dry-run)' : '');
  if (!isDryRun) {
    await execa(cmd, args);
  }
}

async function checkExistingNpmVersion(pkg: PackageJSON, newVersion: string) {
  const npmVersionsCall = await execa('npm', ['view', pkg.name, 'versions', '--json']);
  const publishedVersions: string[] = JSON.parse(npmVersionsCall.stdout);
  if (publishedVersions.includes(newVersion)) {
    panic(`Version "${newVersion}" of ${pkg.name} is already published to npm`);
  }
}

function generateDevVersion(v: string) {
  const d = new Date();
  v += '.';
  v += d.getUTCFullYear() + '';
  v += ('0' + (d.getUTCMonth() + 1)).slice(-2);
  v += ('0' + d.getUTCDate()).slice(-2);
  v += ('0' + d.getUTCHours()).slice(-2);
  v += ('0' + d.getUTCMinutes()).slice(-2);
  v += ('0' + d.getUTCSeconds()).slice(-2);
  return v;
}

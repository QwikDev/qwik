import { BuildConfig, PackageJSON, panic } from './util';
import execa from 'execa';
import { join } from 'path';
import { readPackageJson, writePackageJson } from './package-json';
import semver from 'semver';
import { validateBuild } from './validate-build';

export async function setVersion(config: BuildConfig) {
  const rootPkg = await readPackageJson(config.rootDir);
  config.distVersion = rootPkg.version;

  if (
    (typeof config.setVersion !== 'string' && typeof config.setVersion !== 'number') ||
    String(config.setVersion) === ''
  ) {
    config.setVersion = undefined;
    config.distVersion = generateDevVersion(rootPkg.version);
    return;
  }

  const distTag = String(config.setDistTag);
  if (distTag === '' && !config.dryRun) {
    panic(`Invalid npm dist tag "${distTag}"`);
  }

  const newVersion = semver.clean(String(config.setVersion), { loose: true })!;
  if (!newVersion) {
    panic(`Invalid semver version "${config.setVersion}"`);
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
  const isDryRun = !!config.dryRun;

  const distPkgDir = config.distPkgDir;
  const pkgJsonPath = join(config.rootDir, 'package.json');
  const distPkg = await readPackageJson(distPkgDir);
  const version = distPkg.version;
  const gitTag = `v${version}`;
  const distTag = String(config.setDistTag) || 'dryrun';

  console.log(`🚢 publishing ${distPkg.name} ${version}`, isDryRun ? '(dry-run)' : '');

  // create a pack.tgz which is useful for debugging and uploaded as an artifact
  const pkgTarName = `builder.io-qwik-${version}.tgz`;
  await execa('npm', ['pack'], { cwd: distPkgDir });
  await execa('mv', [pkgTarName, '../'], { cwd: distPkgDir });

  // create a changelog back to the last release tag
  // this also gets uploaded as an artifact
  await execa('yarn', ['changelog']);

  // make sure our build is good to go and has the files we expect
  // and each of the files can be parsed correctly
  await validateBuild(config);

  // make sure this version hasn't already been published
  // a dev build should also not conflict
  await checkExistingNpmVersion(distPkg, version);

  // check all is good with an npm publish --dry-run before we continue
  // dry-run does everything the same except actually publish to npm
  const npmPublishArgs = ['publish', '--tag', distTag, '--access', 'public'];
  await run('npm', npmPublishArgs, true, true, { cwd: distPkgDir });

  // looks like the npm publish --dry-run was successful and
  // we have more confidence that it should work on a real publish

  // set the user git config email
  const actor = process.env.GITHUB_ACTOR || 'builderbot';
  const actorEmail = `${actor}@users.noreply.github.com`;
  const gitConfigEmailArgs = ['config', 'user.email', actorEmail];
  await run('git', gitConfigEmailArgs, isDryRun);

  // set the user git config name
  const gitConfigNameArgs = ['config', 'user.name', actor];
  await run('git', gitConfigNameArgs, isDryRun);

  // git add the changed package.json
  const gitAddArgs = ['add', pkgJsonPath];
  await run('git', gitAddArgs, isDryRun);

  // git commit the changed package.json
  // also adding "skip ci" to the message so the commit doesn't bother building
  const gitCommitTitle = version;
  const gitCommitBody = `skip ci`;
  const gitCommitArgs = ['commit', '-m', gitCommitTitle, '-m', gitCommitBody];
  await run('git', gitCommitArgs, isDryRun);

  // git tag this commit
  const gitTagArgs = ['tag', '-f', '-m', version, gitTag];
  await run('git', gitTagArgs, isDryRun);

  // git push to the repo
  const gitPushArgs = ['push', '--follow-tags'];
  await run('git', gitPushArgs, isDryRun);

  console.log(
    `🐳 commit version "${version}" with git tag "${gitTag}"`,
    isDryRun ? '(dry-run)' : ''
  );

  if (!isDryRun) {
    // if we've made it this far then the npm publish dry-run passed
    // and all of the git command worked, time to publish!!
    // ⛴ LET'S GO!!
    await run('npm', npmPublishArgs, false, false, { cwd: distPkgDir });
  }

  console.log(
    `🐋 published version "${version}" of ${distPkg.name} with dist-tag "${distTag}" to npm`,
    isDryRun ? '(dry-run)' : ''
  );
}

async function run(
  cmd: string,
  args: string[],
  skipExecution?: boolean,
  dryRunCliFlag?: boolean,
  opts?: execa.Options
) {
  if (dryRunCliFlag) {
    args = [...args, '--dry-run'];
  }
  const bash = `  ${cmd} ${args.join(' ')}`;
  console.log(bash, opts ? JSON.stringify(opts) : '');
  if (!skipExecution) {
    const result = await execa(cmd, args, opts);
    if (result.failed) {
      panic(`Finished with error: ${bash}`);
    }
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

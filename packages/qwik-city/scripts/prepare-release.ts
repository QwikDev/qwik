/* eslint-disable no-console */
import { checkExistingNpmVersion, releaseVersionPrompt } from '../../../scripts/release';
import { readPackageJson, writePackageJson } from '../../../scripts/package-json';
import { join } from 'path';
import { panic, run } from '../../../scripts/util';
import semver from 'semver';

async function prepareReleaseQwikCity() {
  const pkgRootDir = join(__dirname, '..');
  const pkg = await readPackageJson(pkgRootDir);

  console.log(`⛴ preparing ${pkg.name} ${pkg.version} release`);

  const answers = await releaseVersionPrompt(pkg.name, pkg.version);
  if (!semver.valid(answers.version)) {
    panic(`Invalid version`);
  }

  pkg.version = answers.version;

  await checkExistingNpmVersion(pkg.name, pkg.version);

  await writePackageJson(pkgRootDir, pkg);

  // git add the changed package.json
  const gitAddArgs = ['add', join(pkgRootDir, 'package.json')];
  await run('git', gitAddArgs);

  // git commit the changed package.json
  const commitMessage = `qwik-city ${pkg.version}`;
  const gitCommitArgs = ['commit', '--message', commitMessage];
  await run('git', gitCommitArgs);

  console.log(``);
  console.log(`Next:`);
  console.log(` - Submit a PR to main with the package.json update`);
  console.log(` - Once merged, run the "Release Qwik City" workflow`);
  console.log(` - https://github.com/BuilderIO/qwik/actions/workflows/release-qwik-city.yml`);
  console.log(``);
}

prepareReleaseQwikCity();

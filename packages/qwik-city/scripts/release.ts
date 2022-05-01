/* eslint-disable no-console */
import mri from 'mri';
import { join } from 'path';
import { run } from '../../../scripts/util';
import { readPackageJson } from '../../../scripts/package-json';

async function releaseQwikCity() {
  const args = mri(process.argv.slice(2));

  const distTag = args['set-dist-tag'];

  const pkgRootDir = join(__dirname, '..');
  const pkg = await readPackageJson(pkgRootDir);

  console.log(`🚢 publishing ${pkg.name} ${pkg.version}`);

  const npmPublishArgs = ['publish', '--tag', distTag, '--access', 'public'];
  await run('npm', npmPublishArgs, false, false, { cwd: pkgRootDir });
}

releaseQwikCity();

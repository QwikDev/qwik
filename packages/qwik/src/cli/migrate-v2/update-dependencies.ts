import { readPackageJson, writePackageJson } from './../utils/utils';
// import { getPackageManager } from './../utils/utils';
// import { installDeps } from '../utils/install-deps';
import { versions } from './versions';

export async function updateDependencies() {
  // TODO(migrate-v2): rely on workspaceRoot instead?
  const packageJson = await readPackageJson(process.cwd());
  const devDependencies = (packageJson.devDependencies ??= {});

  // TODO: this logic should be enhanced to check in both dependencies and devDependencies
  for (const key of Object.keys(devDependencies)) {
    if (Object.prototype.hasOwnProperty.call(versions, key)) {
      // for now only updating existing dependencies if they exist in root package.json
      devDependencies[key] = versions[key as unknown as keyof typeof versions];
    }
  }

  await writePackageJson(process.cwd(), packageJson);
  // TODO(migrate-v2): not installing dependencies because we don't have correct versions set
  // const { install } = installDeps(getPackageManager(), process.cwd());
  // const passed = await install;
  // if (!passed) {
  //   throw new Error('Failed to install dependencies');
  // }
}

import { installDeps } from '../utils/install-deps';
import { getPackageManager, readPackageJson, writePackageJson } from './../utils/utils';
import { versions } from './versions';

export async function updateDependencies() {
  // TODO(migrate-v2): rely on workspaceRoot instead?
  const packageJson = await readPackageJson(process.cwd());
  const devDependencies = (packageJson.devDependencies ??= {});
  const dependencies = (packageJson.dependencies ??= {});

  for (const key of Object.keys(devDependencies)) {
    if (Object.prototype.hasOwnProperty.call(versions, key)) {
      devDependencies[key] = versions[key as unknown as keyof typeof versions];
    }
  }
  for (const key of Object.keys(dependencies)) {
    if (Object.prototype.hasOwnProperty.call(versions, key)) {
      dependencies[key] = versions[key as unknown as keyof typeof versions];
    }
  }

  await writePackageJson(process.cwd(), packageJson);
  runInstall();
}

export async function installTsMorph() {
  const packageJson = await readPackageJson(process.cwd());
  if (packageJson.dependencies?.['ts-morph'] || packageJson.devDependencies?.['ts-morph']) {
    return false;
  }
  (packageJson.devDependencies ??= {})['ts-morph'] = 'latest';
  await runInstall();
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
}

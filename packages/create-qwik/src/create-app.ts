import type { CreateAppOptions, CreateAppResult, IntegrationData } from '../../qwik/src/cli/types';
import fs from 'node:fs';
import { isAbsolute, join } from 'node:path';
import {
  cleanPackageJson,
  getPackageManager,
  writePackageJson,
} from '../../qwik/src/cli/utils/utils';
import { updateApp } from '../../qwik/src/cli/add/update-app';
import { loadTemplates } from './helpers/loadTemplates';

export async function createApp(opts: CreateAppOptions) {
  const isLibrary = opts.starterId === 'library';
  const pkgManager = getPackageManager();

  validateOptions(opts);

  if (!fs.existsSync(opts.outDir)) {
    fs.mkdirSync(decodeURIComponent(opts.outDir), { recursive: true });
  }

  const result: CreateAppResult = {
    starterId: opts.starterId,
    outDir: opts.outDir,
    pkgManager,
    docs: [],
  };

  const { baseApp, libraryApp, templates } = await loadTemplates('app');

  if (isLibrary) {
    await createFromStarter(pkgManager, result, libraryApp);
    return result;
  }

  const starterApp = templates.find((s) => s.id === opts.starterId);

  if (!starterApp) {
    throw new Error(
      `Invalid starter id "${opts.starterId}". It can only be one of${templates.map(
        (app) => ` "${app.id}"`
      )}.`
    );
  }

  await createFromStarter(pkgManager, result, baseApp, starterApp);

  return result;
}

function isValidOption(value: any) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateOptions(opts: CreateAppOptions) {
  if (!isValidOption(opts.starterId)) {
    throw new Error(`Missing starter id`);
  }

  if (!isValidOption(opts.outDir)) {
    throw new Error(`Missing outDir`);
  }

  if (!isAbsolute(opts.outDir)) {
    throw new Error(`outDir must be an absolute path`);
  }
}

async function createFromStarter(
  pkgManager: string,
  result: CreateAppResult,
  baseApp: IntegrationData,
  starterApp?: IntegrationData
) {
  result.docs.push(...baseApp.docs);
  const appInfo = starterApp ?? baseApp;
  const appPkgJson = cleanPackageJson({
    ...baseApp.pkgJson,
    name: `my-${appInfo.pkgJson.name}`,
    description: appInfo.pkgJson.description,
    scripts: undefined,
    dependencies: undefined,
    devDependencies: undefined,
  });
  await writePackageJson(result.outDir, appPkgJson);

  const readmePath = join(result.outDir, 'README.md');
  await fs.promises.writeFile(readmePath, '');

  const baseUpdate = await updateApp(pkgManager, {
    rootDir: result.outDir,
    integration: baseApp.id,
    installDeps: false,
  });

  await baseUpdate.commit(false);

  if (starterApp) {
    result.docs.push(...starterApp.docs);
    const starterUpdate = await updateApp(pkgManager, {
      rootDir: result.outDir,
      integration: starterApp.id,
      installDeps: false,
    });

    await starterUpdate.commit(false);
  }
}

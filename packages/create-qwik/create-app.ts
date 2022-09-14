/* eslint-disable no-console */
import fs from 'fs';
import { isAbsolute, join, resolve } from 'path';
import { cleanPackageJson, panic, writePackageJson } from '../qwik/src/cli/utils/utils';
import { loadIntegrations } from '../qwik/src/cli/utils/integrations';
import { logCreateAppResult } from '../qwik/src/cli/utils/log';
import { updateApp } from '../qwik/src/cli/add/update-app';
import type {
  CreateAppOptions,
  CreateAppResult,
  IntegrationData,
  IntegrationPackageJson,
} from '../qwik/src/cli/types';

export async function runCreateCli(starterId: string, outDir: string) {
  if (writeToCwd()) {
    // write to the current working directory
    outDir = process.cwd();
  } else {
    // create a sub directory
    outDir = getOutDir(outDir);
    if (fs.existsSync(outDir)) {
      panic(
        `Directory "${outDir}" already exists. Please either remove this directory, or choose another location.`
      );
    }
  }

  const opts: CreateAppOptions = {
    starterId,
    outDir,
  };

  const result = await createApp(opts);

  logCreateAppResult(result, false);

  return result;
}

export async function createApp(opts: CreateAppOptions) {
  if (!isValidOption(opts.starterId)) {
    throw new Error(`Missing starter id`);
  }
  if (!isValidOption(opts.outDir)) {
    throw new Error(`Missing outDir`);
  }
  if (!isAbsolute(opts.outDir)) {
    throw new Error(`outDir must be an absolute path`);
  }
  if (!fs.existsSync(opts.outDir)) {
    fs.mkdirSync(opts.outDir, { recursive: true });
  }

  const result: CreateAppResult = {
    starterId: opts.starterId,
    outDir: opts.outDir,
  };

  const starterApps = (await loadIntegrations()).filter((i) => i.type === 'app');
  const baseApp = starterApps.find((a) => a.id === 'base');
  const starterApp = starterApps.find((s) => s.id === opts.starterId);
  if (!baseApp) {
    throw new Error(`Unable to find base app`);
  }
  if (!starterApp) {
    throw new Error(`Invalid starter id "${opts.starterId}"`);
  }

  await createFromStarter(result, baseApp, starterApp);

  return result;
}

async function createFromStarter(
  result: CreateAppResult,
  baseApp: IntegrationData,
  starterApp: IntegrationData
) {
  const appPkgJson: IntegrationPackageJson = {
    name: `qwik-app`,
    description: starterApp.description.trim(),
    private: true,
  };
  await writePackageJson(result.outDir, cleanPackageJson(appPkgJson));

  const readmePath = join(result.outDir, 'README.md');
  await fs.promises.writeFile(readmePath, '');

  const baseUpdate = await updateApp({
    rootDir: result.outDir,
    integration: baseApp.id,
    installDeps: false,
  });
  await baseUpdate.commit(false);

  const starterUpdate = await updateApp({
    rootDir: result.outDir,
    integration: starterApp.id,
    installDeps: false,
  });
  await starterUpdate.commit(false);
}

function isValidOption(value: any) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function getOutDir(outDir: string) {
  return resolve(process.cwd(), outDir);
}

export function writeToCwd() {
  return isStackBlitz();
}

function isStackBlitz() {
  try {
    // /home/projects/abc123
    return process.cwd().startsWith('/home/projects/');
  } catch (e) {
    /**/
  }
  return false;
}

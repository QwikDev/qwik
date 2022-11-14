/* eslint-disable no-console */
import type { CreateAppOptions, CreateAppResult, IntegrationData } from '../qwik/src/cli/types';
import fs from 'node:fs';
import color from 'kleur';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  cleanPackageJson,
  getPackageManager,
  panic,
  writePackageJson,
} from '../qwik/src/cli/utils/utils';
import { loadIntegrations } from '../qwik/src/cli/utils/integrations';
import { logSuccessFooter } from '../qwik/src/cli/utils/log';
import { updateApp } from '../qwik/src/cli/add/update-app';

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

export function logCreateAppResult(result: CreateAppResult, ranInstall: boolean) {
  console.log(``);
  console.log(``);

  const isCwdDir = process.cwd() === result.outDir;
  const relativeProjectPath = relative(process.cwd(), result.outDir);

  if (isCwdDir) {
    console.log(`🦄 ${color.bgMagenta(' Success! ')}`);
  } else {
    console.log(
      `🦄 ${color.bgMagenta(' Success! ')} ${color.cyan(`Project created in`)} ${color.bold(
        color.magenta(relativeProjectPath)
      )} ${color.cyan(`directory`)}`
    );
  }
  console.log(``);

  console.log(`🐰 ${color.cyan(`Next steps:`)}`);
  if (!isCwdDir) {
    console.log(`   cd ${relativeProjectPath}`);
  }
  const pkgManager = getPackageManager();
  if (!ranInstall) {
    console.log(`   ${pkgManager} install`);
  }
  console.log(`   ${pkgManager} start`);
  console.log(``);

  const qwikAdd = pkgManager !== 'npm' ? `${pkgManager} qwik add` : `npm run qwik add`;
  console.log(`🔌 ${color.cyan('Integrations? Add Netlify, Cloudflare, Tailwind...')}`);
  console.log(`   ${qwikAdd}`);
  console.log(``);

  logSuccessFooter(result.docs);

  console.log(`📺 ${color.cyan('Presentations, Podcasts and Videos:')}`);
  console.log(`   https://qwik.builder.io/media/`);
  console.log(``);
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
    docs: [],
  };

  const starterApps = (await loadIntegrations()).filter((i) => i.type === 'app');
  const isLibrary = opts.starterId === 'library';
  if (isLibrary) {
    const baseApp = starterApps.find((a) => a.id === 'library');
    if (!baseApp) {
      throw new Error(`Unable to find base app`);
    }
    await createFromStarter(result, baseApp);
  } else {
    const baseApp = starterApps.find((a) => a.id === 'base');
    if (!baseApp) {
      throw new Error(`Unable to find base app`);
    }
    const starterApp = starterApps.find((s) => s.id === opts.starterId);
    if (!starterApp) {
      throw new Error(
        `Invalid starter id "${opts.starterId}". It can only be one of${starterApps.map(
          (app) => ` "${app.id}"`
        )}.`
      );
    }

    await createFromStarter(result, baseApp, starterApp);
  }
  return result;
}

async function createFromStarter(
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

  const baseUpdate = await updateApp({
    rootDir: result.outDir,
    integration: baseApp.id,
    installDeps: false,
  });
  await baseUpdate.commit(false);

  if (starterApp) {
    result.docs.push(...starterApp.docs);
    const starterUpdate = await updateApp({
      rootDir: result.outDir,
      integration: starterApp.id,
      installDeps: false,
    });
    await starterUpdate.commit(false);
  }
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

/* eslint-disable no-console */
import prompts from 'prompts';
import color from 'kleur';
import { backgroundInstallDeps } from './install-deps';
import fs from 'fs';
import { loadStarterData } from '../qwik/src/cli/starters';
import { getPackageManager } from '../qwik/src/cli/utils';
import { createOutDir, createOutDirName, createApp, logResult } from './create-app';
import type { CreateAppOptions } from '../qwik/src/cli/types';
import { relative } from 'path';

export async function runCreateInteractiveCli() {
  console.clear();

  console.log(`💫 ${color.cyan(`Let's create a Qwik app`)} 💫`);
  console.log(``);

  const pkgManager = getPackageManager();

  const starterApps = await loadStarterData('apps');
  const baseApp = starterApps.find((a) => a.id === 'base')!;
  const apps = starterApps.filter((a) => a.id !== baseApp!.id);

  const backgroundInstall = backgroundInstallDeps(pkgManager, baseApp);

  const projectNameAnswer = await prompts(
    {
      type: 'text',
      name: 'projectName',
      message: 'Project name',
      initial: 'qwik-app',
    },
    {
      onCancel: () => {
        console.log('');
        process.exit(1);
      },
    }
  );
  console.log(``);

  const projectName: string = projectNameAnswer.projectName;
  const outDirName = createOutDirName(projectName);
  const outDir = createOutDir(outDirName);
  let removeExistingOutDirPromise: Promise<void> | null = null;

  if (fs.existsSync(outDir)) {
    const existingOutDirAnswer = await prompts(
      {
        type: 'select',
        name: 'outDirChoice',
        message: `Directory "./${relative(
          process.cwd(),
          outDir
        )}" already exists. What would you like to do?`,
        choices: [
          { title: 'Do not overwrite this directory and exit', value: 'exit' },
          { title: 'Overwrite and replace this directory', value: 'replace' },
        ],
        hint: ' ',
      },
      {
        onCancel: async () => {
          console.log('\n' + color.dim(` - Exited without modifying "${outDir}"`) + '\n');
          await backgroundInstall.abort();
          process.exit(1);
        },
      }
    );
    console.log(``);
    if (existingOutDirAnswer.outDirChoice === 'replace') {
      removeExistingOutDirPromise = fs.promises.rm(outDir, { recursive: true });
    } else {
      console.log('\n' + color.dim(` - Exited without modifying "${outDir}"`) + '\n');
      await backgroundInstall.abort();
      process.exit(1);
    }
  }

  const starterIdAnswer = await prompts(
    {
      type: 'select',
      name: 'starterId',
      message: 'Select a starter',
      choices: apps.map((s) => {
        return { title: s.name, value: s.id, description: s.description };
      }),
      hint: ' ',
    },
    {
      onCancel: async () => {
        console.log('');
        await backgroundInstall.abort();
        process.exit(1);
      },
    }
  );
  console.log(``);
  const starterId = starterIdAnswer.starterId;

  const runInstallAnswer = await prompts(
    {
      type: 'confirm',
      name: 'runInstall',
      message: `Would you like to install ${pkgManager} dependencies?`,
      initial: true,
    },
    {
      onCancel: async () => {
        console.log('');
        await backgroundInstall.abort();
        process.exit(1);
      },
    }
  );
  console.log(``);

  if (removeExistingOutDirPromise) {
    await removeExistingOutDirPromise;
  }

  const runInstall: boolean = runInstallAnswer.runInstall;

  const opts: CreateAppOptions = {
    starterId,
    projectName,
    outDir,
  };

  const result = await createApp(opts);

  const successfulDepsInstall = await backgroundInstall.complete(runInstall, result.outDir);

  logResult(result, successfulDepsInstall);

  return result;
}

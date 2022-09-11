/* eslint-disable no-console */
import fs from 'fs';
import { relative } from 'path';
import prompts from 'prompts';
import color from 'kleur';
import type { CreateAppOptions } from '../qwik/src/cli/types';
import { backgroundInstallDeps } from '../qwik/src/cli/utils/install-deps';
import { createOutDir, createOutDirName, createApp } from './create-app';
import { getPackageManager } from '../qwik/src/cli/utils/utils';
import { logCreateAppResult } from '../qwik/src/cli/utils/log';
import { loadIntegrations } from '../qwik/src/cli/utils/integrations';

export async function runCreateInteractiveCli() {
  console.log(``);
  console.clear();

  console.log(`💫 ${color.cyan(`Let's create a Qwik app`)} 💫`);
  console.log(``);

  const pkgManager = getPackageManager();

  const integrations = await loadIntegrations();
  const starterApps = integrations.filter((i) => i.type === 'app');
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

  logCreateAppResult(result, successfulDepsInstall);

  return result;
}

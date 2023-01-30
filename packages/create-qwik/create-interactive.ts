/* eslint-disable no-console */
import fs from 'node:fs';
import { relative } from 'node:path';
import prompts from 'prompts';
import color from 'kleur';
import type { CreateAppOptions } from '../qwik/src/cli/types';
import { backgroundInstallDeps } from '../qwik/src/cli/utils/install-deps';
import { createApp, getOutDir, logCreateAppResult } from './create-app';
import { getPackageManager } from '../qwik/src/cli/utils/utils';
import { loadIntegrations } from '../qwik/src/cli/utils/integrations';

export async function runCreateInteractiveCli() {
  console.log(``);
  console.clear();
  console.log(``);

  console.log(
    `🐰 ${color.cyan(`Let's create a`)} ${color.bold(color.magenta(`Qwik`))} ${color.cyan(
      `app`
    )} 🐇   ${color.dim(`v${(globalThis as any).QWIK_VERSION}`)}`
  );
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
      name: 'outDir',
      message: 'Where would you like to create your new project?',
      initial: './qwik-app',
    },
    {
      onCancel: () => {
        console.log('');
        process.exit(1);
      },
    }
  );
  console.log(``);

  const outDir: string = getOutDir(projectNameAnswer.outDir.trim());

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
          { title: 'Overwrite this directory', value: 'overwrite' },
        ],
        hint: '(use ↓↑ arrows, hit enter)',
      },
      {
        onCancel: async () => {
          console.log(color.dim(` - Exited without modifying "${outDir}"`) + '\n');
          await backgroundInstall.abort();
          process.exit(1);
        },
      }
    );
    console.log(``);
    if (existingOutDirAnswer.outDirChoice === 'exit') {
      console.log(color.dim(` - Exited without modifying "${outDir}"`) + '\n');
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
        return { title: s.name, value: s.id, description: '└─' + s.pkgJson?.description };
      }),
      hint: '(use ↓↑ arrows, hit enter)',
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

  const runInstall: boolean = runInstallAnswer.runInstall;

  const opts: CreateAppOptions = {
    starterId,
    outDir,
  };

  const result = await createApp(opts);

  const successfulDepsInstall = await backgroundInstall.complete(runInstall, result.outDir);

  logCreateAppResult(pkgManager, result, successfulDepsInstall);

  return result;
}

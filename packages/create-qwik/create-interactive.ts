import fs from 'node:fs';
import { relative } from 'node:path';
import { text, select, confirm, intro, outro, cancel, spinner, isCancel } from '@clack/prompts';
import { bgBlue } from 'kleur/colors';
import type { CreateAppOptions } from '../qwik/src/cli/types';
import { backgroundInstallDeps } from '../qwik/src/cli/utils/install-deps';
import { createApp, getOutDir, logCreateAppResult } from './create-app';
import { getPackageManager, note, wait } from '../qwik/src/cli/utils/utils';
import { loadIntegrations } from '../qwik/src/cli/utils/integrations';

export async function runCreateInteractiveCli() {
  intro(`Let's create a ${bgBlue(' Qwik App ')} ✨ (v${(globalThis as any).QWIK_VERSION})`);

  await wait(500);

  const defaultProjectName = './qwik-app';
  const projectNameAnswer =
    (await text({
      message: 'Where would you like to create your new project?',
      placeholder: defaultProjectName,
      validate(value) {
        if (value.trim() === '.' || value.trim() === './') {
          return "Please don't use '.' or './' and let qwik create the directory for you.";
        }
      },
    })) || defaultProjectName;

  if (isCancel(projectNameAnswer)) {
    cancel('Operation cancelled.');
    process.exit(0);
  }

  const pkgManager = getPackageManager();

  const integrations = await loadIntegrations();
  const starterApps = integrations.filter((i) => i.type === 'app');
  const baseApp = starterApps.find((a) => a.id === 'base')!;
  const apps = starterApps.filter((a) => a.id !== baseApp!.id);

  const backgroundInstall = backgroundInstallDeps(pkgManager, baseApp);

  const outDir: string = getOutDir(projectNameAnswer.trim());

  let removeExistingOutDirPromise: Promise<void> | null = null;

  if (fs.existsSync(outDir)) {
    const existingOutDirAnswer = await select({
      message: `Directory "./${relative(
        process.cwd(),
        outDir
      )}" already exists. What would you like to do?`,
      options: [
        { value: 'exit', label: 'Do not overwrite this directory and exit' },
        { value: 'replace', label: 'Overwrite and replace this directory' },
      ],
    });

    if (isCancel(existingOutDirAnswer) || existingOutDirAnswer === 'exit') {
      cancel('Operation cancelled.');
      process.exit(0);
    }

    if (existingOutDirAnswer === 'replace') {
      removeExistingOutDirPromise = fs.promises.rm(outDir, { recursive: true });
    }
  }

  const starterIdAnswer = await select({
    message: 'Select a starter',
    options: apps.map((s) => {
      return { label: s.name, value: s.id, hint: s.pkgJson?.description };
    }),
  });

  if (isCancel(starterIdAnswer)) {
    cancel('Operation cancelled.');
    process.exit(0);
  }

  const starterId = starterIdAnswer;

  const runInstallAnswer = await confirm({
    message: `Would you like to install ${pkgManager} dependencies?`,
    initialValue: true,
  });

  if (isCancel(runInstallAnswer)) {
    cancel('Operation cancelled.');
    process.exit(0);
  }

  if (removeExistingOutDirPromise) {
    await removeExistingOutDirPromise;
  }

  const runInstall: boolean = runInstallAnswer;

  const opts: CreateAppOptions = {
    starterId,
    outDir,
  };

  const s = spinner();

  s.start('Creating App');
  const result = await createApp(opts);
  s.stop('Created App 🐰');

  let successfulDepsInstall = false;
  if (runInstall) {
    s.start('Installing dependencies');
    successfulDepsInstall = await backgroundInstall.complete(runInstall, result.outDir);
    s.stop(`${successfulDepsInstall ? 'Installed' : 'Failed to install'} dependencies 📋`);
  }

  note(logCreateAppResult(pkgManager, result, successfulDepsInstall), 'Result');

  outro('Happy coding! 🐇');

  return result;
}

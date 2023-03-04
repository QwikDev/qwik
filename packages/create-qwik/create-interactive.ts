import fs from 'node:fs';
import { relative } from 'node:path';
import { text, select, confirm, intro, outro, cancel, spinner, isCancel } from '@clack/prompts';
import { gray, white, green, reset, bgBlue } from 'kleur/colors';
import type { CreateAppOptions } from '../qwik/src/cli/types';
import { backgroundInstallDeps } from '../qwik/src/cli/utils/install-deps';
import { createApp, getOutDir, logCreateAppResult } from './create-app';
import { getPackageManager } from '../qwik/src/cli/utils/utils';
import { loadIntegrations } from '../qwik/src/cli/utils/integrations';

// Used from https://github.com/natemoo-re/clack/blob/main/packages/prompts/src/index.ts
function ansiRegex() {
  const pattern = [
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))',
  ].join('|');

  return new RegExp(pattern, 'g');
}

const bar = '│';
const strip = (str: string) => str.replace(ansiRegex(), '');
const note = (message = '', title = '') => {
  const lines = `\n${message}\n`.split('\n');
  const len =
    lines.reduce((sum, ln) => {
      ln = strip(ln);
      return ln.length > sum ? ln.length : sum;
    }, 0) + 2;
  const msg = lines
    .map((ln) => `${gray(bar)}  ${white(ln)}${' '.repeat(len - strip(ln).length)}${gray(bar)}`)
    .join('\n');
  process.stdout.write(
    `${gray(bar)}\n${green('○')}  ${reset(title)} ${gray(
      '─'.repeat(len - title.length - 1) + '╮'
    )}\n${msg}\n${gray('├' + '─'.repeat(len + 2) + '╯')}\n`
  );
};
// End of used code from clack

export async function runCreateInteractiveCli() {
  intro(`Let's create a ${bgBlue(' Qwik App ')} ✨ (v${(globalThis as any).QWIK_VERSION})`);

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

  const backgroundInstall = backgroundInstallDeps(pkgManager, baseApp, true);

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
    s.stop('Installed dependencies 📋');
  }

  note(logCreateAppResult(pkgManager, result, successfulDepsInstall), 'Result');

  outro('');

  return result;
}

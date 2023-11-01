import { cancel, intro, log, spinner as spinnerPrompt } from '@clack/prompts';

import type { CreateAppResult } from 'packages/qwik/src/cli/types';
import { bgBlue } from 'kleur/colors';
import { clearDir } from './helpers/clearDir';
import { createApp } from './create-app';
import fs from 'node:fs';
import { getPackageManager } from '../../qwik/src/cli/utils/utils';
import { installDepsCli } from './helpers/installDepsCli';
import { installDeps as installDepsFn } from 'packages/qwik/src/cli/utils/install-deps';
import { logAppCreated } from './helpers/logAppCreated';
import { makeTemplateManager } from './helpers/templateManager';
import { resolveRelativeDir } from './helpers/resolveRelativeDir';
import yargs from 'yargs';

type Args = {
  outDir: string;
  template: string;
  installDeps: boolean;
  force: boolean;
};

function parseArgs(args: string[], templates: string[]) {
  const parsedArgs = yargs(args)
    .strict()
    .command('* <template> <outDir>', 'Create a new project powered by qwik', (yargs) => {
      return yargs
        .positional('template', {
          type: 'string',
          desc: 'Starter template',
          choices: templates,
        })
        .positional('outDir', {
          type: 'string',
          desc: 'Directory of the project',
        })
        .option('force', {
          alias: 'f',
          type: 'boolean',
          default: false,
          desc: 'Overwrite target directory if it exists',
        })
        .option('installDeps', {
          alias: 'i',
          default: false,
          type: 'boolean',
          desc: 'Install dependencies',
        })
        .usage('npm create qwik@latest base ./my-project <options>');
    }).argv as unknown as Args;

  return parsedArgs;
}

/** @param args Pass here process.argv.slice(2) */
export async function runCreateCli(...args: string[]): Promise<CreateAppResult> {
  const pkgManager = getPackageManager();
  const templateManager = await makeTemplateManager('app');
  const templateVariants = templateManager.standaloneTemplates.map(({ id }) => id);

  const parsedArgs = parseArgs(args, templateVariants);
  const { force, installDeps, template } = parsedArgs;

  let outDir = parsedArgs.outDir;

  intro(`Let's create a ${bgBlue(' Qwik App ')} ✨ (v${(globalThis as any).QWIK_VERSION})`);

  if (writeToCwd()) {
    // write to the current working directory
    outDir = process.cwd();
  } else {
    // create a sub directory
    outDir = resolveRelativeDir(outDir);

    if (fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0) {
      if (force) {
        await clearDir(outDir);
      } else {
        log.error(`Directory "${outDir}" already exists.`);
        log.info(
          `Please either remove this directory, choose another location or run the command again with '--force | -f' flag.`
        );
        cancel();
        process.exit(1);
      }
    }
  }

  const result = await createApp({ outDir, appId: template, pkgManager, templateManager });
  const spinner = spinnerPrompt();

  let isDepsInstalled = false;

  if (installDeps) {
    isDepsInstalled = await installDepsCli(
      async () => await installDepsFn(pkgManager, outDir).install,
      { pkgManager, spinner }
    );
  }

  logAppCreated(pkgManager, result, isDepsInstalled);

  return result;
}

function writeToCwd() {
  return isStackBlitz();
}

function isStackBlitz() {
  try {
    // /home/projects/abc123
    return process.cwd().startsWith('/home/projects/');
  } catch {
    // ignore
  }
  return false;
}

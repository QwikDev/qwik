import type { CreateAppResult } from 'packages/qwik/src/cli/types';
import { clearDir } from './helpers/clearDir';
import { createApp } from './create-app';
import fs from 'node:fs';
import { installDepsCli } from './helpers/installDepsCli';
import { installDeps as installDepsFn } from 'packages/qwik/src/cli/utils/install-deps';
import { logAppCreated } from './helpers/logAppCreated';
import { panic } from '../../qwik/src/cli/utils/utils';
import { resolveRelativeDir } from './helpers/resolveRelativeDir';
import { spinner as spinnerPrompt } from '@clack/prompts';
import yargs from 'yargs';

type Args = {
  outDir: string;
  template: string;
  installDeps: boolean;
  force: boolean;
};

function parseArgs(args: string[]) {
  const parsedArgs = yargs(args).command(
    '* <template> <outDir>',
    'Create a new project powered by qwik',
    (yargs) => {
      return yargs
        .positional('template', {
          type: 'string',
          desc: 'Starter template',
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
    }
  ).argv as unknown as Args;

  return parsedArgs;
}

/**
 * @param args pass here process.argv.slice(2)
 */
export async function runCreateCli(...args: string[]): Promise<CreateAppResult> {
  const parsedArgs = parseArgs(args);

  const { force, installDeps, template } = parsedArgs;
  let outDir = parsedArgs.outDir;

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
        panic(
          `Directory "${outDir}" already exists. Please either remove this directory, or choose another location.`
        );
      }
    }
  }

  const result = await createApp({ outDir, starterId: template });
  const pkgManager = result.pkgManager;
  const spinner = spinnerPrompt();

  let isDepsInstalled = false;

  if (installDeps) {
    isDepsInstalled = await installDepsCli(
      async () => await installDepsFn(pkgManager, outDir).install,
      {
        pkgManager,
        spinner,
      }
    );
  }

  logAppCreated(result.pkgManager, result, isDepsInstalled, true);

  return result;
}

function writeToCwd() {
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

/* eslint-disable no-console */
import color from 'kleur';
import { AppCommand } from './utils/app-command';
import { runAddCommand } from './add/run-add';
import { panic } from './utils/utils';
import { runDevCommand } from './dev/run-dev';
import { runServeCommand } from './serve/run-serve';
import { runSsgCommand } from './ssg/run-ssg';
import { runBuildCommand } from './build/run-build';

export async function runCli() {
  try {
    const app = new AppCommand({
      rootDir: '',
      cwd: process.cwd(),
      args: process.argv.slice(2),
    });
    await runCommand(app);
  } catch (e) {
    panic(String(e));
  }
}

async function runCommand(app: AppCommand) {
  switch (app.task) {
    case 'add': {
      await runAddCommand(app);
      return;
    }
    case 'build': {
      await runBuildCommand(app);
      return;
    }
    case 'dev': {
      await runDevCommand(app);
      return;
    }
    case 'serve': {
      await runServeCommand(app);
      return;
    }
    case 'ssg': {
      await runSsgCommand(app);
      return;
    }
    case 'help': {
      printHelp();
      return;
    }
    case 'version': {
      printVersion();
      return;
    }
  }

  if (typeof app.task === 'string') {
    console.log(color.red(`Unrecognized qwik command: ${app.task}`) + '\n');
  }

  await printHelp();
  process.exit(1);
}

async function printHelp() {
  console.log(color.bgCyan(` Qwik Help `));
  console.log(``);
  console.log(`  qwik add      ${color.dim(`Add an integration`)}`);
  console.log(`  qwik build    ${color.dim(`Parallelize client/server builds and type checking`)}`);
  console.log(`  qwik dev      ${color.dim(`Vite dev build with ssr mode`)}`);
  console.log(`  qwik serve    ${color.dim(`Serve the production build`)}`);
  console.log(`  qwik ssg      ${color.dim(`Run build then static site generation`)}`);
  console.log(``);
}

function printVersion() {
  console.log((globalThis as any).QWIK_VERSION);
}

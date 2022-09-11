/* eslint-disable no-console */
import color from 'kleur';
import { AppCommand } from './utils/app-command';
import { printAddHelp, runAddCommand } from './add/run-add';
import { panic } from './utils/utils';
import { runDevCommand } from './dev/run-dev';
import { runFmtCommand } from './fmt/run-fmt';
import { runLintCommand } from './lint/run-lint';
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
    case 'fmt': {
      await runFmtCommand(app);
      return;
    }
    case 'lint': {
      await runLintCommand(app);
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

  await printHelp();
  process.exit(1);
}

async function printHelp() {
  console.log(color.bgCyan(` Qwik Help `));
  console.log(``);
  await printAddHelp();
}

function printVersion() {
  console.log(color.cyan((globalThis as any).QWIK_VERSION));
}

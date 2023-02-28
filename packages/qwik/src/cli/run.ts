/* eslint-disable no-console */
import { red, bgMagenta, cyan, dim } from 'kleur/colors';
import { AppCommand } from './utils/app-command';
import { runAddCommand } from './add/run-add-command';
import { panic, pmRunCmd } from './utils/utils';
import { runBuildCommand } from './build/run-build-command';

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
    console.log(red(`Unrecognized qwik command: ${app.task}`) + '\n');
  }

  await printHelp();
  process.exit(1);
}

async function printHelp() {
  const pmRun = pmRunCmd();
  console.log(``);
  console.log(bgMagenta(` Qwik Help `));
  console.log(``);
  console.log(`  ${pmRun} qwik ${cyan(`add`)}            ${dim(`Add an integration to this app`)}`);
  console.log(
    `  ${pmRun} qwik ${cyan(`build`)}          ${dim(`Parallelize builds and type checking`)}`
  );
  console.log(
    `  ${pmRun} qwik ${cyan(`build preview`)}  ${dim(`Same as "build", but for preview server`)}`
  );
  console.log(``);
}

function printVersion() {
  console.log((globalThis as any).QWIK_VERSION);
}

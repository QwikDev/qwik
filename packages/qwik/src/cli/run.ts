/* eslint-disable no-console */
import color from 'kleur';
import { AppCommand } from './utils/app-command';
import { runAddCommand } from './add/run-add-command';
import { note, panic, pmRunCmd, printHeader } from './utils/utils';
import { runBuildCommand } from './build/run-build-command';
import { intro, outro } from '@clack/prompts';

export async function runCli() {
  console.clear();
  printHeader();

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
    console.log(color.red(`Unrecognized qwik command: ${app.task}`) + '\n');
  }

  await printHelp();
  process.exit(1);
}

async function printHelp() {
  const pmRun = pmRunCmd();

  intro(color.bgMagenta().white(` Qwik Help `));

  note(
    `
${pmRun} qwik ${color.cyan(`add`)}            ${color.dim(`Add an integration to this app`)}
${pmRun} qwik ${color.cyan(`build`)}          ${color.dim(`Parallelize builds and type checking`)}
${pmRun} qwik ${color.cyan(`build preview`)}  ${color.dim(
      `Same as "build", but for preview server`
    )}
  `,
    'Available commands'
  );

  console.log(``);
  console.log(color.bgMagenta(` Qwik Help `));
  console.log(``);
  console.log(
    `  ${pmRun} qwik ${color.cyan(`add`)}            ${color.dim(`Add an integration to this app`)}`
  );
  console.log(
    `  ${pmRun} qwik ${color.cyan(`build`)}          ${color.dim(
      `Parallelize builds and type checking`
    )}`
  );
  console.log(
    `  ${pmRun} qwik ${color.cyan(`build preview`)}  ${color.dim(
      `Same as "build", but for preview server`
    )}`
  );
  console.log(``);
}

function printVersion() {
  console.log((globalThis as any).QWIK_VERSION);
}

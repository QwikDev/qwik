/* eslint-disable no-console */
import { red, dim, cyan, bgMagenta } from 'kleur/colors';
import { AppCommand } from './utils/app-command';
import { runAddCommand } from './add/run-add-command';
import { runNewCommand } from './new/run-new-command';
import { runJokeCommand } from './joke/run-joke-command';
import { note, panic, pmRunCmd, printHeader, bye } from './utils/utils';
import { runBuildCommand } from './build/run-build-command';
import { intro, isCancel, select, confirm } from '@clack/prompts';

const SPACE_TO_HINT = 18;
const COMMANDS = [
  {
    value: 'add',
    label: 'add',
    hint: 'Add an integration to this app',
    run: (app: AppCommand) => runAddCommand(app),
    showInHelp: true,
  },
  {
    value: 'build',
    label: 'build',
    hint: 'Parallelize builds and type checking',
    run: (app: AppCommand) => runBuildCommand(app),
    showInHelp: true,
  },
  {
    value: 'build preview',
    label: 'build preview',
    hint: 'Same as "build", but for preview server',
    run: (app: AppCommand) => runBuildCommand(app),
    showInHelp: true,
  },
  {
    value: 'new',
    label: 'new',
    hint: 'Create a new component or route',
    run: (app: AppCommand) => runNewCommand(app),
    showInHelp: true,
  },
  {
    value: 'joke',
    label: 'joke',
    hint: 'Tell a random dad joke',
    run: () => runJokeCommand(),
    showInHelp: true,
  },
  {
    value: 'help',
    label: 'help',
    hint: 'Show this help',
    run: (app: AppCommand) => printHelp(app),
    showInHelp: false,
  },
  {
    value: 'version',
    label: 'version',
    hint: 'Show the version',
    run: () => printVersion(),
    showInHelp: false,
  },
];

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
      printHelp(app);
      return;
    }
    case 'new': {
      await runNewCommand(app);
      return;
    }
    case 'joke': {
      await runJokeCommand();
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

  await printHelp(app);
  process.exit(1);
}

async function printHelp(app: AppCommand) {
  const pmRun = pmRunCmd();

  intro(`🔭  ${bgMagenta(' Qwik Help ')}`);

  note(
    COMMANDS.filter((cmd) => cmd.showInHelp)
      .map(
        (cmd) =>
          `${pmRun} qwik ${cyan(cmd.label)}` +
          ' '.repeat(Math.max(SPACE_TO_HINT - cmd.label.length, 2)) +
          dim(cmd.hint)
      )
      .join('\n'),
    'Available commands'
  );

  const proceed = await confirm({
    message: 'Do you want to run a command?',
    initialValue: true,
  });

  if (isCancel(proceed) || !proceed) {
    bye();
  }

  const command = await select({
    message: 'Select a command',
    options: COMMANDS.filter((cmd) => cmd.showInHelp).map((cmd) => ({
      value: cmd.value,
      label: `${pmRun} qwik ${cyan(cmd.label)}`,
      hint: cmd.hint,
    })),
  });

  if (isCancel(command)) {
    bye();
  }

  await runCommand(Object.assign(app, { task: command as string }));
}

function printVersion() {
  console.log((globalThis as any).QWIK_VERSION);
}

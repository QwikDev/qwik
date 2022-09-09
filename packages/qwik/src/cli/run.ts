/* eslint-disable no-console */
import { printAddHelp, runAddCommand } from './add';
import type { AppCommand } from './app-command';
import color from 'kleur';

export async function runCommand(app: AppCommand) {
  switch (app.task) {
    case 'add': {
      await runAddCommand(app);
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

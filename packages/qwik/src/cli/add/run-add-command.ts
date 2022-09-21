/* eslint-disable no-console */
import type { AppCommand } from '../utils/app-command';
import color from 'kleur';
import { runAddInteractive } from './run-add-interactive';
import { printAddHelp } from './print-add-help';

export async function runAddCommand(app: AppCommand) {
  try {
    const id = app.args[1];
    if (id === 'help') {
      await printAddHelp();
    } else {
      await runAddInteractive(app, id);
    }
  } catch (e) {
    console.error(`\n❌ ${color.red(String(e))}\n`);
    await printAddHelp();
    process.exit(1);
  }
}

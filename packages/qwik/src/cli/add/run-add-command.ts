import type { AppCommand } from '../utils/app-command';
import { red } from 'picocolors';
import { runAddInteractive } from './run-add-interactive';
import { printAddHelp } from './print-add-help';

export async function runAddCommand(app: AppCommand) {
  try {
    const id = app.args[1];
    if (id === 'help') {
      await printAddHelp(app);
    } else {
      await runAddInteractive(app, id);
    }
  } catch (e) {
    console.error(`❌ ${red(String(e))}\n`);
    await printAddHelp(app);
    process.exit(1);
  }
}

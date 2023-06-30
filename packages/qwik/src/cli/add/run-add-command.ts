import { red } from 'kleur/colors';
import type { AppCommand } from '../utils/app-command';
import { printAddHelp } from './print-add-help';
import { runAddInteractive } from './run-add-interactive';

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
    process.exit(1);
  }
}

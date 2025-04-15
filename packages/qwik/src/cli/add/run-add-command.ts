import type { AppCommand } from '../utils/app-command';
import { red } from 'kleur/colors';
import { runAddInteractive } from './run-add-interactive';
import { printAddHelp } from './print-add-help';
import { runQwikClientCommand } from '../check-client/run-qwik-client-command';
export async function runAddCommand(app: AppCommand) {
  try {
    const id = app.args[1];
    if (id === 'help') {
      await printAddHelp(app);
    } else {
      await runAddInteractive(app, id);
      await runQwikClientCommand(app);
    }
  } catch (e) {
    console.error(`❌ ${red(String(e))}\n`);
    process.exit(1);
  }
}

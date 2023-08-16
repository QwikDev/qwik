import type { AppCommand } from '../utils/app-command';
import { red } from 'kleur/colors';
import { runAddInteractive } from './run-add-interactive';
import { printAddHelp } from './print-add-help';
import { isAskingForHelp } from '../utils/utils';

export async function runAddCommand(app: AppCommand) {
  try {
    if (isAskingForHelp(app.args)) {
      await printAddHelp(app);
    } else {
      await runAddInteractive(app, app.args[1]);
    }
  } catch (e) {
    console.error(`❌ ${red(String(e))}\n`);
    process.exit(1);
  }
}

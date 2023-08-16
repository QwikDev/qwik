import type { AppCommand } from '../utils/app-command';
import { red } from 'kleur/colors';
import { runAddInteractive } from './run-add-interactive';
import { printAddHelp } from './print-add-help';

export async function runAddCommand(app: AppCommand) {
  try {
    if (app.args.length > 1 && ['-h', '--help'].includes(app.args[1])) {
      await printAddHelp(app);
    } else {
      await runAddInteractive(app, app.args[1]);
    }
  } catch (e) {
    console.error(`❌ ${red(String(e))}\n`);
    process.exit(1);
  }
}

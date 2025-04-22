import type { AppCommand } from '../utils/app-command';
import { red } from 'kleur/colors';
import { checkClientCommand } from './check-client-command';

export async function runQwikClientCommand(app: AppCommand) {
  try {
    const manifestPath = app.args[1];
    await checkClientCommand(app, manifestPath);
  } catch (e) {
    console.error(`❌ ${red(String(e))}\n`);
    process.exit(1);
  }
}

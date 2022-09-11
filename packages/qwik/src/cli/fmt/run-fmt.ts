import type { AppCommand } from '../utils/app-command';
import { execa } from 'execa';

export async function runFmtCommand(app: AppCommand) {
  const arg = app.args.includes('write') ? '--write' : '--check';

  await execa('prettier', [arg, app.rootDir], {
    stdio: 'inherit',
  });
}

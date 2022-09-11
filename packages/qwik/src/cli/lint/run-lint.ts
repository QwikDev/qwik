import type { AppCommand } from '../utils/app-command';
import { execa } from 'execa';
import { join } from 'path';

export async function runLintCommand(app: AppCommand) {
  const p = join(app.rootDir, 'src', '**', '*.ts*');

  await execa('eslint', [p], {
    stdio: 'inherit',
  });
}

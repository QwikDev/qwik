import type { AppCommand } from '../utils/app-command';
import { execa } from 'execa';

export async function runDevCommand(_app: AppCommand) {
  await execa('vite', ['--mode', 'ssr'], {
    stdio: 'inherit',
  });
}

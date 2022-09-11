/* eslint-disable no-console */
import type { AppCommand } from '../utils/app-command';
import color from 'kleur';
import { execa } from 'execa';

export async function runDevCommand(_app: AppCommand) {
  console.log(color.dim(`vite --mode ssr`) + '\n');

  await execa('vite', ['--mode', 'ssr'], {
    stdio: 'inherit',
  });
}

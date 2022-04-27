import { execa } from 'execa';
import { BuildConfig, panic, run } from './util';

export async function tsc(config: BuildConfig) {
  const result = await execa('tsc', [], {
    stdout: 'inherit',
  });
  if (result.failed) {
    panic(`tsc failed`);
  }
}

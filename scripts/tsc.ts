import { execa } from 'execa';
import { panic } from './util';

export async function tsc() {
  const result = await execa('tsc', [], {
    stdout: 'inherit',
  });
  if (result.failed) {
    panic(`tsc failed`);
  }
}

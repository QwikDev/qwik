import { execa } from 'execa';
import { join } from 'node:path';
import { panic, type BuildConfig } from './util';

const PACKAGE = 'qwik-labs';

export async function buildQwikLabs(config: BuildConfig) {
  const input = join(config.packagesDir, PACKAGE);

  const result = await execa('pnpm', ['build'], {
    stdout: 'inherit',
    cwd: input,
  });

  if (result.failed) {
    panic(`tsc failed`);
  }
  console.log(`⚛️  ${PACKAGE}`);
}

import { execa } from 'execa';
import { join } from 'node:path';
import { copyDir, panic, type BuildConfig } from './util';

const PACKAGE = 'qwik-auth';

export async function buildQwikAuth(config: BuildConfig) {
  const input = join(config.packagesDir, PACKAGE);

  const result = await execa('pnpm', ['build'], {
    stdout: 'inherit',
    cwd: input,
  });

  if (result.failed) {
    panic(`tsc failed`);
  }
  await copyDir(
    config,
    join(config.dtsDir, 'packages', 'qwik-auth', 'src'),
    join(input, 'lib', 'types')
  );
  console.log(`⚛️  ${PACKAGE}`);
}

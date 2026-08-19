import { type BuildConfig, copyDir, panic } from './util.ts';
import { join } from 'node:path';
import { execa } from 'execa';

const PACKAGE = 'qwik-utils';

export async function buildQwikUtils(config: BuildConfig) {
  const input = join(config.packagesDir, PACKAGE);

  const result = await execa('pnpm', ['build'], {
    stdout: 'inherit',
    cwd: input,
  });

  if (result.failed) {
    panic(`qwik-utils build failed`);
  }
  await copyDir(
    config,
    join(config.dtsDir, 'packages', 'qwik-utils', 'src'),
    join(input, 'lib', 'types')
  );
  console.log(`🧰 ${PACKAGE}`);
}

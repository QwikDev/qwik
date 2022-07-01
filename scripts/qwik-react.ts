import { BuildConfig, copyDir, panic } from './util';
import { join } from 'path';
import { execa } from 'execa';

const PACKAGE = 'qwik-react';

export async function buildQwikReact(config: BuildConfig) {
  const input = join(config.packagesDir, PACKAGE);

  const result = await execa('yarn', ['build'], {
    stdout: 'inherit',
    cwd: input,
  });

  if (result.failed) {
    panic(`tsc failed`);
  }
  await copyDir(
    config,
    join(config.dtsDir, 'packages', 'qwik-react', 'src'),
    join(input, 'lib', 'types')
  );
  console.log(`⚛️  ${PACKAGE}`);
}

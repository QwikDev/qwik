import { execa } from 'execa';
import { join } from 'path';
import { type BuildConfig, panic } from './util.ts';

// TODO DRY
export async function tscQwik(config: BuildConfig) {
  console.log('tsc qwik');
  const result = await execa('tsc', ['-p', join(config.srcQwikDir, '..', 'tsconfig.json')], {
    stdout: 'inherit',
  });
  if (result.failed) {
    panic(`tsc for qwik failed`);
  }
}

export async function tscQwikRouter(config: BuildConfig) {
  console.log('tsc qwik-router');
  const result = await execa('tsc', ['-p', join(config.srcQwikRouterDir, '..', 'tsconfig.json')], {
    stdout: 'inherit',
  });
  if (result.failed) {
    panic(`tsc for qwik failed`);
  }
}

export async function tsc(config: BuildConfig) {
  console.log('tsc');
  const result = await execa('tsc', {
    stdout: 'inherit',
  });
  if (result.failed) {
    panic(`tsc failed`);
  }
}

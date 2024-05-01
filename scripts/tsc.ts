import { execa } from 'execa';
import { type BuildConfig, emptyDir, panic } from './util';
import { join } from 'path';

// TODO DRY
export async function tscQwik(config: BuildConfig) {
  if (!config.dev) {
    emptyDir(config.tscDir);
    emptyDir(config.dtsDir);
  }
  console.log('tsc qwik');
  const result = await execa('tsc', ['-p', join(config.srcQwikDir, '..', 'tsconfig.json')], {
    stdout: 'inherit',
  });
  if (result.failed) {
    panic(`tsc for qwik failed`);
  }
}

export async function tscQwikCity(config: BuildConfig) {
  console.log('tsc qwik-city');
  const result = await execa('tsc', ['-p', join(config.srcQwikCityDir, 'tsconfig.json')], {
    stdout: 'inherit',
  });
  if (result.failed) {
    panic(`tsc for qwik failed`);
  }
}

export async function tsc(config: BuildConfig) {
  // if (!config.dev) {
  //   emptyDir(config.tscDir);
  //   emptyDir(config.dtsDir);
  // }

  console.log('tsc');
  const result = await execa('tsc', {
    stdout: 'inherit',
  });
  if (result.failed) {
    panic(`tsc failed`);
  }
}

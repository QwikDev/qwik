import { execa } from 'execa';
import { join } from 'path';
import { type BuildConfig, panic } from './util.ts';

async function runTsc(label: string, tsconfigPath?: string) {
  console.log(`tsc ${label}`);
  const args = tsconfigPath ? ['-p', tsconfigPath] : [];
  const result = await execa('tsc', args, { stdout: 'inherit' });
  if (result.failed) {
    panic(`tsc for ${label} failed`);
  }
}

export const tscQwik = (config: BuildConfig) =>
  runTsc('qwik', join(config.srcQwikDir, '..', 'tsconfig.json'));

export const tscQwikRouter = (config: BuildConfig) =>
  runTsc('qwik-router', join(config.srcQwikRouterDir, '..', 'tsconfig.json'));

export const tsc = (_config: BuildConfig) => runTsc('all');

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

// tsconfig.dts.json resolves core/router to source so router dts avoids TS5055.
// Dev type errors only warn — esbuild already built the bundle.
export const tscDevDts = async (config: BuildConfig) => {
  console.log('tsc dev (dts)');
  const result = await execa('tsc', ['-p', join(config.rootDir, 'tsconfig.dts.json')], {
    stdout: 'inherit',
    reject: false,
  });
  if (result.failed) {
    console.warn('⚠️  tsc dev reported type errors — .d.ts emitted best-effort (dev)');
  }
};

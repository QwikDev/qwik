import { execa } from 'execa';
import { panic, type BuildConfig } from './util.ts';

export async function buildDevtools(config: BuildConfig) {
  const result = await execa('npm', ['run', 'build'], {
    stdout: 'inherit',
    cwd: config.devtoolsPkgDir,
  });

  if (result.failed) {
    panic(`vite build for devtools failed`);
  }

  console.log(`devtools`);
}

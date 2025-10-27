import { execa } from 'execa';
import { emptyDir, panic, type BuildConfig } from './util';

export async function buildQwikRouter(config: BuildConfig) {
  if (!config.dev) {
    emptyDir(config.distQwikRouterPkgDir);
  }

  const result = await execa('npm', ['run', 'build'], {
    stdout: 'inherit',
    cwd: `${config.srcQwikRouterDir}/..`,
  });
  if (result.failed) {
    panic(`vite build for router failed`);
  }

  console.log(`🏙  qwik-router`);
}

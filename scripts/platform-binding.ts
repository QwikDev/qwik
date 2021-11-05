import { BuildConfig, ensureDir } from './util';
import spawn from 'cross-spawn';
import { join } from 'path';

export async function buildPlatformBinding(config: BuildConfig) {
  if (!config.platformBinding) {
    return;
  }

  ensureDir(config.distPkgDir);

  const cmd = `napi`;
  const args = [`build`, `--platform`, `--config=napi.config.json`, config.distPkgDir];

  if (!config.dev) {
    args.push(`--release`);
  }

  const napiCwd = join(config.srcDir, 'napi');

  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', cwd: napiCwd });
    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) {
        resolve(child.stdout);
      } else {
        reject(`napi exited with code ${code}`);
      }
    });
  });

  console.log('🐯 native binding');
}

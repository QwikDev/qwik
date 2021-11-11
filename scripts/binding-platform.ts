import { BuildConfig, ensureDir } from './util';
import spawn from 'cross-spawn';
import { join } from 'path';

export async function buildPlatformBinding(config: BuildConfig) {
  await new Promise((resolve, reject) => {
    try {
      ensureDir(config.distPkgDir);
      ensureDir(config.distBindingsDir);

      const cmd = `napi`;
      const args = [`build`, `--platform`, `--config=napi.config.json`, config.distBindingsDir];

      if (config.platformTarget) {
        args.push(`--target`, config.platformTarget);
      }
      if (!config.dev) {
        args.push(`--release`);
      }

      const napiCwd = join(config.srcDir, 'napi');

      const child = spawn(cmd, args, { stdio: 'inherit', cwd: napiCwd });
      child.on('error', reject);

      child.on('close', (code) => {
        if (code === 0) {
          resolve(child.stdout);
        } else {
          reject(`napi exited with code ${code}`);
        }
      });
    } catch (e) {
      reject(e);
    }
  });

  console.log('🐯 native binding');
}

import { BuildConfig, ensureDir } from './util';
import spawn from 'cross-spawn';
import { join } from 'path';
import { renameSync } from 'fs';

export async function buildWasm(config: BuildConfig) {
  if (!config.wasm) {
    return;
  }

  ensureDir(config.distPkgDir);

  async function buildForTarget(target: string) {

    const cmd = `wasm-pack`;
    const output = join(config.distPkgDir, `wasm`);
    const args = [`build`, `--target`, target, `--out-dir`, output];
    if (!config.dev) {
      args.push(`--release`);
    }
    const wasmCwd = join(config.srcDir, `wasm`);

    await new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: 'inherit', cwd: wasmCwd });
      child.on('error', reject);

      child.on('close', (code) => {
        if (code === 0) {
          resolve(child.stdout);
        } else {
          reject(`wasm-pack exited with code ${code}`);
        }
      });
    });
    // renameSync(join(output, 'qwik_wasm.js'), join(output, 'qwik_wasm.cjs'));
  }

  await buildForTarget("nodejs");

  console.log('⚙️ wasm binding');
}

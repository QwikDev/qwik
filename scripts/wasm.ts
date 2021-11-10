import { BuildConfig, ensureDir } from './util';
import spawn from 'cross-spawn';
import { join } from 'path';
import { renameSync } from 'fs';
import { rollup } from 'rollup';

export async function buildWasm(config: BuildConfig) {
  if (!config.wasm) {
    return;
  }

  ensureDir(config.distPkgDir);

  async function buildForTarget(env = {}) {
    const cmd = `wasm-pack`;
    const outputPath = join(config.distPkgDir, 'bindings', `wasm`);
    const args = [`build`, '--target', 'web', `--out-dir`, outputPath];
    if (!config.dev) {
      args.push(`--release`);
    }
    const wasmCwd = join(config.srcDir, `wasm`);

    await new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        stdio: 'inherit',
        env: {
          ...process.env,
          ...env,
        },
        cwd: wasmCwd,
      });
      child.on('error', reject);

      child.on('close', (code) => {
        if (code === 0) {
          resolve(child.stdout);
        } else {
          reject(`wasm-pack exited with code ${code}`);
        }
      });
    });
    return {
      output: join(outputPath, 'qwik_wasm.js'),
      dir: outputPath,
    };
  }

  const data = await buildForTarget({
    CARGO_PROFILE_RELEASE_LTO: true,
    CARGO_PROFILE_RELEASE_PANIC: 'abort',
    CARGO_PROFILE_RELEASE_OPT_LEVEL: 'z',
  });

  console.log('⚙️ wasm binding');

  const build = await rollup({
    input: data.output,
  });

  await build.write({
    format: 'es',
    file: join(data.dir, 'index.mjs'),
    exports: 'named'
  });

  await build.write({
    format: 'cjs',
    file: join(data.dir, 'index.cjs'),
    exports: 'named'
  });

  console.log('⚙️ generating node glue code');
}

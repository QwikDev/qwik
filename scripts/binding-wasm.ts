import { BuildConfig, copyFile, emptyDir, ensureDir } from './util';
import spawn from 'cross-spawn';
import { join } from 'path';
import { rollup } from 'rollup';

export async function buildWasmBinding(config: BuildConfig) {
  const srcWasmDir = join(config.srcDir, `wasm`);
  const tmpBuildDir = join(config.tmpDir, `wasm-out`);

  ensureDir(config.distPkgDir);
  ensureDir(config.distBindingsDir);
  emptyDir(tmpBuildDir);

  async function buildForTarget(env = {}) {
    const cmd = `wasm-pack`;
    const args = [`build`, '--target', 'web', `--out-dir`, tmpBuildDir];
    if (!config.dev) {
      args.push(`--release`);
    }

    await new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        stdio: 'inherit',
        env: {
          ...process.env,
          ...env,
        },
        cwd: srcWasmDir,
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
    return join(tmpBuildDir, 'qwik_wasm.js');
  }

  const wasmJsBuildPath = await buildForTarget({
    CARGO_PROFILE_RELEASE_LTO: true,
    CARGO_PROFILE_RELEASE_PANIC: 'abort',
    CARGO_PROFILE_RELEASE_OPT_LEVEL: 'z',
  });

  const build = await rollup({
    input: wasmJsBuildPath,
  });

  await build.write({
    format: 'es',
    file: join(config.distBindingsDir, 'qwik.wasm.mjs'),
    exports: 'named',
  });

  await build.write({
    format: 'cjs',
    file: join(config.distBindingsDir, 'qwik.wasm.cjs'),
    exports: 'named',
  });

  await copyFile(
    join(tmpBuildDir, 'qwik_wasm_bg.wasm'),
    join(config.distBindingsDir, 'qwik_wasm_bg.wasm')
  );

  console.log('🐻 wasm binding');
}

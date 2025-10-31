import { type BuildConfig, copyFile, emptyDir, ensureDir } from './util';
import { execa } from 'execa';
import { join } from 'node:path';
import { rollup } from 'rollup';

export async function buildWasmBinding(config: BuildConfig) {
  const srcWasmDir = join(config.srcQwikDir, `wasm`);
  const tmpBuildDir = join(config.tmpDir, `wasm-out`);

  ensureDir(config.distQwikPkgDir);
  ensureDir(config.distBindingsDir);
  emptyDir(tmpBuildDir);

  async function buildForTarget(env = {}) {
    const cmd = `wasm-pack`;
    const args = [`build`, '--target', 'web', `--out-dir`, tmpBuildDir, srcWasmDir];
    if (!config.dev) {
      args.push(`--release`);
    }

    // 2. Replace the entire Promise wrapper with one line
    //    execa handles errors and non-zero exit codes automatically.
    await execa(cmd, args, {
      stdio: 'inherit', // 'inherit' is still used to show build output
      shell: true,
      env: {
        ...process.env,
        ...env,
      },
    });

    // 3. The return statement is unchanged
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

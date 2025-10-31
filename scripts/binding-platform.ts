import { execa } from 'execa';
import { copyFile, writeFile } from 'fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDir, type BuildConfig } from './util';

export async function buildPlatformBinding(config: BuildConfig) {
  ensureDir(config.distQwikPkgDir);
  ensureDir(config.distBindingsDir);

  const cmd = `napi`;
  const args = [
    `build`,
    `--cargo-name`,
    'qwik_napi',
    `--platform`,
    `--config=packages/qwik/src/napi/napi.config.json`,
    config.distBindingsDir,
  ];

  if (config.platformTarget) {
    args.push(`--target`, config.platformTarget);
  }
  if (!config.dev) {
    args.push(`--release`);
    args.push(`--strip`);
  }

  const napiCwd = join(config.rootDir);

  await execa(cmd, args, {
    stdio: 'inherit',
    cwd: napiCwd,
  });

  console.log('🐯 native binding');
}

// TODO only download current target and wasm
export async function copyPlatformBindingWasm(config: BuildConfig) {
  ensureDir(config.distQwikPkgDir);
  ensureDir(config.distBindingsDir);
  const cacheDir = join(config.tmpDir, `cached-bindings`);
  ensureDir(cacheDir);

  let version = config.distVersion;
  const isDev = version.includes('-dev');
  let cdnUrl = 'https://cdn.jsdelivr.net/npm/';
  let packageName: string;
  if (isDev) {
    cdnUrl = `https://pkg.pr.new/QwikDev/qwik/`;
    version = version.split('-dev')[0];
  }
  if (version.startsWith('2')) {
    // 6903 is the PR that builds v2
    packageName = `@qwik.dev/core@${isDev ? '6903' : version}`;
  } else {
    packageName = `@builder.io/qwik@${isDev ? 'main' : version}`;
  }

  let cacheVersionDir: string;
  if (isDev) {
    // We fetch from pkg.pr.new which is a CDN for the CI builds
    // It redirects to the latest version
    cdnUrl = `${cdnUrl}${packageName}`;
    // First request the URL, this will redirect to the latest version
    const rsp = await fetch(cdnUrl);
    if (!rsp.ok) {
      throw new Error(`Unable to find Qwik package from ${cdnUrl}`);
    }
    const url = rsp.url;
    // get the package name from the url
    const realPackageName = url.split('/').pop()!;
    // now check if we already have this package in the cache
    const cachedPath = join(cacheDir, realPackageName);
    if (!existsSync(cachedPath)) {
      ensureDir(cacheDir);
      // download the package
      console.log(`🦉 downloading CI build from ${url}`);
      const pkgRsp = await fetch(url);
      if (!pkgRsp.ok) {
        console.error(pkgRsp);
        throw new Error(`Unable to fetch Qwik package from ${pkgRsp.url}`);
      }
      await writeFile(cachedPath, pkgRsp.body as any);
    }
    // now unpack the package using tar, into the cache directory
    const unpackedPath = join(cacheDir, `${realPackageName}-unpacked`);
    ensureDir(unpackedPath);
    await execa('tar', ['-xvf', cachedPath, '-C', unpackedPath]);

    // now we need to find the bindings in the package
    cacheVersionDir = join(unpackedPath, 'package', 'bindings');
  } else {
    cdnUrl = `${cdnUrl}${packageName}/bindings/`;
    cacheVersionDir = join(cacheDir, version);
    ensureDir(cacheVersionDir);
  }

  try {
    const bindingFilenames = [
      'qwik.darwin-arm64.node',
      'qwik.darwin-x64.node',
      'qwik.linux-x64-gnu.node',
      'qwik.wasm.cjs',
      'qwik.wasm.mjs',
      'qwik.win32-x64-msvc.node',
      'qwik_wasm_bg.wasm',
    ];

    await Promise.all(
      bindingFilenames.map(async (bindingFilename) => {
        const cachedPath = join(cacheVersionDir, bindingFilename);
        const distPath = join(config.distBindingsDir, bindingFilename);

        if (!existsSync(cachedPath)) {
          if (isDev) {
            throw new Error(`Unable to find Qwik binding from ${cachedPath}`);
          }
          const url = `${cdnUrl}${bindingFilename}`;
          console.log(`🦉 native binding / wasm (downloading from ${url})`);
          const rsp = (await fetch(url)) as any;
          if (!rsp.ok) {
            throw new Error(`Unable to fetch Qwik binding from ${rsp.url}`);
          }
          await writeFile(cachedPath, rsp.body);
        }

        await copyFile(cachedPath, distPath);
      })
    );

    console.log(`🦉 native binding / wasm (copied from npm v${version})`);
  } catch (e) {
    console.warn(`😱 ${e}`);
  }
}

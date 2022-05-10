import { BuildConfig, ensureDir } from './util';
import spawn from 'cross-spawn';
import { join } from 'path';
import nodeFetch from 'node-fetch';
import semver from 'semver';
import { existsSync } from 'fs';
import { copyFile, writeFile } from 'fs/promises';

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

export async function copyPlatformBindingWasm(config: BuildConfig) {
  ensureDir(config.distPkgDir);
  ensureDir(config.distBindingsDir);

  const releaseDataUrl = `https://data.jsdelivr.com/v1/package/npm/@builder.io/qwik`;
  const releaseRsp = await nodeFetch(releaseDataUrl);
  const releases = await releaseRsp.json();
  let buildVersion = releases.tags.latest;
  Object.values(releases.tags).forEach((version: any) => {
    if (semver.gt(version, buildVersion)) {
      buildVersion = version;
    }
  });

  const tmpDir = join(config.tmpDir, `cached-bindings`, buildVersion);
  ensureDir(tmpDir);

  const bindingFilenames = [
    'qwik.darwin-arm64.node',
    'qwik.darwin-x64.node',
    'qwik.wasm.cjs',
    'qwik.wasm.mjs',
    'qwik.win32-x64-msvc.node',
    'qwik_wasm_bg.wasm',
  ];

  await Promise.all(
    bindingFilenames.map(async (bindingFilename) => {
      const cachedPath = join(tmpDir, bindingFilename);
      const distPath = join(config.distBindingsDir, bindingFilename);

      if (!existsSync(cachedPath)) {
        const cdnUrl = `https://cdn.jsdelivr.net/npm/@builder.io/qwik@${buildVersion}/bindings/${bindingFilename}`;
        const rsp = await nodeFetch(cdnUrl);
        const code = await rsp.text();
        await writeFile(cachedPath, code);
      }

      await copyFile(cachedPath, distPath);
    })
  );

  console.log(`🦉 native binding / wasm (copied from npm v${buildVersion})`);
}

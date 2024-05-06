import { bgRed, cyan, red } from 'kleur/colors';
import fs from 'node:fs';
import path from 'node:path';
import { log } from '@clack/prompts';
import type { IntegrationData } from '../types';
import { runCommand } from './utils';

export function installDeps(pkgManager: string, dir: string) {
  return runCommand(pkgManager, ['install'], dir);
}

export function runInPkg(pkgManager: string, args: string[], cwd: string) {
  const cmd = pkgManager === 'npm' ? 'npx' : pkgManager;
  return runCommand(cmd, args, cwd);
}

/**
 * This does an initial install of the base dependencies in the background while the install is
 * running. Afterwards the actual dependencies get added and the package manager re-run
 */
export function backgroundInstallDeps(pkgManager: string, baseApp: IntegrationData) {
  const { tmpInstallDir } = setupTmpInstall(baseApp);

  const { install, abort } = installDeps(pkgManager, tmpInstallDir);

  const complete = async (outDir: string) => {
    let success = false;

    try {
      const installed = await install;
      if (installed) {
        const tmpNodeModules = path.join(tmpInstallDir, 'node_modules');
        const appNodeModules = path.join(outDir, 'node_modules');
        await fs.promises.rename(tmpNodeModules, appNodeModules);

        try {
          await fs.promises.rename(
            path.join(tmpInstallDir, 'package-lock.json'),
            path.join(outDir, 'package-lock.json')
          );
        } catch (e) {
          //
        }
        try {
          await fs.promises.rename(
            path.join(tmpInstallDir, 'yarn.lock'),
            path.join(outDir, 'yarn.lock')
          );
        } catch (e) {
          //
        }
        try {
          await fs.promises.rename(
            path.join(tmpInstallDir, 'pnpm-lock.yaml'),
            path.join(outDir, 'pnpm-lock.yaml')
          );
        } catch (e) {
          //
        }

        success = true;
        fs.rmSync(tmpInstallDir, { recursive: true });
      }
    } catch (e: any) {
      if (e) {
        if (e.message) {
          log.error(red(String(e.message)) + `\n\n`);
        } else {
          log.error(red(String(e)) + `\n\n`);
        }
      }
    }

    if (!success) {
      const errorMessage =
        `${bgRed(` ${pkgManager} install failed `)}\n` +
        ` You might need to run ${cyan(
          `"${pkgManager} install"`
        )} manually inside the root of the project.\n\n`;
      log.error(errorMessage);
    }

    return success;
  };

  const out = {
    abort: () => abort().finally(() => fs.rmSync(tmpInstallDir, { recursive: true })),
    complete,
    success: undefined as boolean | undefined,
  };
  install.then((success) => (out.success = success));

  return out;
}

function setupTmpInstall(baseApp: IntegrationData) {
  const tmpId =
    '.create-qwik-' +
    Math.round(Math.random() * Number.MAX_SAFE_INTEGER)
      .toString(36)
      .toLowerCase();
  // Keep in same mountpoint so renames can move quickly
  const tmpInstallDir = path.resolve(baseApp.target!, '..', tmpId);

  try {
    fs.mkdirSync(tmpInstallDir);
  } catch (e) {
    log.error(`❌ ${red(String(e))}`);
  }

  const basePkgJson = path.join(baseApp.dir, 'package.json');
  const tmpPkgJson = path.join(tmpInstallDir, 'package.json');
  fs.copyFileSync(basePkgJson, tmpPkgJson);

  return { tmpInstallDir };
}

import color from 'kleur';
import fs from 'node:fs';
import ora from 'ora';
import os from 'node:os';
import path from 'node:path';
import spawn from 'cross-spawn';
import type { ChildProcess } from 'node:child_process';
import type { IntegrationData } from '../types';

export function installDeps(pkgManager: string, dir: string) {
  return runCommand(pkgManager, ['install'], dir);
}

export function runInPkg(pkgManager: string, args: string[], cwd: string) {
  const cmd = pkgManager === 'npm' ? 'npx' : pkgManager;
  return runCommand(cmd, args, cwd);
}

export function runCommand(cmd: string, args: string[], cwd: string) {
  let installChild: ChildProcess;

  const install = new Promise<boolean>((resolve) => {
    try {
      installChild = spawn(cmd, args, {
        cwd,
        stdio: 'ignore',
      });

      installChild.on('error', () => {
        resolve(false);
      });

      installChild.on('close', (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          resolve(false);
        }
      });
    } catch (e) {
      resolve(false);
    }
  });

  const abort = async () => {
    if (installChild) {
      installChild.kill('SIGINT');
    }
  };

  return { abort, install };
}

export function startSpinner(msg: string) {
  const spinner = ora(msg).start();
  return spinner;
}

export function backgroundInstallDeps(pkgManager: string, baseApp: IntegrationData) {
  const { tmpInstallDir } = setupTmpInstall(baseApp);

  const { install, abort } = installDeps(pkgManager, tmpInstallDir);

  const complete = async (runInstall: boolean, outDir: string) => {
    let success = false;

    if (runInstall) {
      const spinner = startSpinner(`Installing ${pkgManager} dependencies...`);
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

          spinner.succeed();
          success = true;
        } else {
          const errorMessage = `\n\n${color.bgRed(
            `  ${pkgManager} install failed  `
          )}\n  Automatic install failed. "${color.green(
            `${pkgManager} install`
          )}" must be manually executed to install deps.\n`;

          spinner.succeed();
          console.error(errorMessage);
        }
      } catch (e) {
        spinner.fail();
      }
    } else {
      await abort();
    }

    return success;
  };

  return { abort, complete };
}

function setupTmpInstall(baseApp: IntegrationData) {
  const tmpId =
    'create-qwik-' +
    Math.round(Math.random() * Number.MAX_SAFE_INTEGER)
      .toString(36)
      .toLowerCase();
  const tmpInstallDir = path.join(os.tmpdir(), tmpId);

  try {
    fs.mkdirSync(tmpInstallDir);
  } catch (e) {
    console.error(`\n❌ ${color.red(String(e))}\n`);
  }

  const basePkgJson = path.join(baseApp.dir, 'package.json');
  const tmpPkgJson = path.join(tmpInstallDir, 'package.json');
  fs.copyFileSync(basePkgJson, tmpPkgJson);

  return { tmpInstallDir };
}

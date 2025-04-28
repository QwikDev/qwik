import type { AppCommand } from '../utils/app-command';
import { intro, log, outro } from '@clack/prompts';
import { bgBlue, bgMagenta, bold, cyan, yellow, red } from 'kleur/colors';
import { runInPkg } from '../utils/install-deps';
import { getPackageManager, panic } from '../utils/utils';
import fs from 'fs/promises';
import type { Stats } from 'fs';
import path from 'path';

const DISK_DIR: string = path.resolve('dist');
const SRC_DIR: string = path.resolve('src');
const MANIFEST_PATH: string = path.resolve(DISK_DIR, 'q-manifest.json');

export async function runQwikClientCommand(app: AppCommand) {
  try {
    const manifestPath = app.args[1];
    await checkClientCommand(app, manifestPath);
  } catch (e) {
    console.error(`❌ ${red(String(e))}\n`);
    process.exit(1);
  }
}

/**
 * Handles the core logic for the 'check-client' command. Exports this function so other modules can
 * import and call it.
 *
 * @param {AppCommand} app - Application command context (assuming structure).
 */
async function checkClientCommand(app: AppCommand, manifestPath: string): Promise<void> {
  if (!(await clientDirExists())) {
    intro(`🚀 ${bgBlue(bold(' Qwik Client Check '))}`);
    log.step(`Checking Disk directory: ${cyan(DISK_DIR)}`);
    await goBuild(app, manifestPath);
  } else {
    log.step(`Checking q-manifest.json file: ${cyan(DISK_DIR)}`);
    const manifest = await getManifestTs(manifestPath);
    if (manifest === null) {
      await goBuild(app, manifestPath);
    } else {
      log.step(`Compare source modification time with q-manifest.json modification time`);
      if (await isNewerThan(SRC_DIR, manifest)) {
        await goBuild(app, manifestPath);
      }
    }
  }
}

/**
 * Builds the application using the appropriate package manager.
 *
 * @param {AppCommand} app - The application command object containing app details.
 * @param {string} manifestPath - The path to the manifest file (though it's not used in the current
 *   function).
 * @throws {Error} Throws an error if the build process encounters any issues.
 */

async function goBuild(app: AppCommand, manifestPath: string) {
  const pkgManager = getPackageManager();
  log.step('Building client (manifest missing or outdated)...');
  try {
    const { install } = await runInPkg(pkgManager, ['run', 'build.client'], app.rootDir);
    if (!(await install)) {
      throw new Error('Client build command reported failure.');
    }
  } catch (buildError: any) {
    log.error(`Build error: ${buildError.message}`);
    throw new Error('Client build process encountered an error.');
  }
  outro(`✅ ${bgMagenta(bold(' Check complete '))}`);
}

/**
 * Retrieves the last modified timestamp of the manifest file.
 *
 * @param {string} manifestPath - The path to the manifest file.
 * @returns {Promise<number | null>} Returns the last modified timestamp (in milliseconds) of the
 *   manifest file, or null if an error occurs.
 */
async function getManifestTs(manifestPath: string = MANIFEST_PATH) {
  try {
    // Get stats for the manifest file
    const stats: Stats = await fs.stat(manifestPath);
    return stats.mtimeMs;
  } catch (err: any) {
    // Handle errors accessing the manifest file
    if (err.code === 'ENOENT') {
      log.warn(`q-manifest.json file not found: ${yellow(DISK_DIR)}`);
    } else {
      panic(`Error accessing manifest file ${manifestPath}: ${err.message}`);
    }
    return null;
  }
}

/**
 * Checks if the specified disk directory exists and is accessible.
 *
 * @returns {Promise<boolean>} Returns true if the directory exists and can be accessed, returns
 *   false if it doesn't exist or an error occurs.
 */
export async function clientDirExists(): Promise<boolean> {
  try {
    await fs.access(DISK_DIR);
    return true; // Directory exists
  } catch (err: any) {
    panic(`Error accessing disk directory ${DISK_DIR}: ${err.message}`);
    return false; // Directory doesn't exist or there was an error
  }
}

/**
 * Recursively finds the latest modification time (mtime) of any file in the given directory.
 *
 * @param {string} directoryPath - The directory path to search.
 * @returns {Promise<number>} Returns the latest mtime (Unix timestamp in milliseconds), or 0 if the
 *   directory doesn't exist or is empty.
 */
export async function isNewerThan(directoryPath: string, timestamp: number): Promise<boolean> {
  let returnValue = false;
  async function traverse(dir: string): Promise<void> {
    if (returnValue) {
      return;
    }
    let items: Array<import('fs').Dirent>;
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.warn(`Cannot read directory ${dir}: ${err.message}`);
      }
      return;
    }

    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      try {
        if (item.isDirectory()) {
          await traverse(fullPath);
        } else if (item.isFile()) {
          const stats = await fs.stat(fullPath);
          if (stats.mtimeMs > timestamp) {
            returnValue = true;
            return;
          }
        }
      } catch (err: any) {
        console.warn(`Cannot access ${fullPath}: ${err.message}`);
      }
    }
  }

  await traverse(directoryPath);
  return returnValue;
}

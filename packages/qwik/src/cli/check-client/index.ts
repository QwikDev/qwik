import type { AppCommand } from '../utils/app-command';
// Removed non-critical logging to keep command output silent unless there are serious issues
import { red } from 'kleur/colors';
import { runInPkg } from '../utils/install-deps';
import { getPackageManager, panic } from '../utils/utils';
import fs from 'fs/promises';
import type { Stats } from 'fs';
import path from 'path';

const getDiskPath = (dist: string) => path.resolve(dist);
const getSrcPath = (src: string) => path.resolve(src);
const getManifestPath = (dist: string) => path.resolve(dist, 'q-manifest.json');

export async function runQwikClientCommand(app: AppCommand) {
  try {
    const src = app.args[1];
    const dist = app.args[2];
    await checkClientCommand(app, src, dist);
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
async function checkClientCommand(app: AppCommand, src: string, dist: string): Promise<void> {
  if (!(await clientDirExists(dist))) {
    await goBuild(app);
  } else {
    const manifest = await getManifestTs(getManifestPath(dist));
    if (manifest === null) {
      await goBuild(app);
    } else {
      if (await hasNewer(getSrcPath(src), manifest)) {
        await goBuild(app);
      }
    }
  }
}

/**
 * Builds the application using the appropriate package manager.
 *
 * @param {AppCommand} app - The application command object containing app details.e path to the
 *   manifest file (though it's not used in the current function).
 * @throws {Error} Throws an error if the build process encounters any issues.
 */

async function goBuild(app: AppCommand) {
  const pkgManager = getPackageManager();
  const { install } = await runInPkg(pkgManager, ['run', 'build.client'], app.rootDir);
  if (!(await install)) {
    throw new Error('Client build command reported failure.');
  }
}

/**
 * Retrieves the last modified timestamp of the manifest file.
 *
 * @param {string} manifestPath - The path to the manifest file.
 * @returns {Promise<number | null>} Returns the last modified timestamp (in milliseconds) of the
 *   manifest file, or null if an error occurs.
 */
async function getManifestTs(manifestPath: string) {
  try {
    // Get stats for the manifest file
    const stats: Stats = await fs.stat(manifestPath);
    return stats.mtimeMs;
  } catch (err: any) {
    // Handle errors accessing the manifest file
    if (err.code !== 'ENOENT') {
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
export async function clientDirExists(path: string): Promise<boolean> {
  try {
    await fs.access(getDiskPath(path));
    return true; // Directory exists
  } catch (err: any) {
    if (!(err.code === 'ENOENT')) {
      panic(`Error accessing disk directory ${path}: ${err.message}`);
    }
    return false; // Directory doesn't exist or there was an error
  }
}

/**
 * Recursively finds the latest modification time (mtime) of any file in the given directory.
 *
 * @param {string} srcPath - The directory path to search.
 * @returns {Promise<number>} Returns the latest mtime (Unix timestamp in milliseconds), or 0 if the
 *   directory doesn't exist or is empty.
 */
export async function hasNewer(srcPath: string, timestamp: number): Promise<boolean> {
  let returnValue = false;
  async function traverse(dir: string): Promise<void> {
    if (returnValue) {
      return;
    }
    let items: Array<import('fs').Dirent>;
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch (err: any) {
      return;
    }

    for (const item of items) {
      if (returnValue) {
        return;
      }
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
        // Intentionally silent for non-critical access issues
      }
    }
  }

  await traverse(srcPath);
  return returnValue;
}

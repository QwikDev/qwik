#!/usr/bin/env node

import fs from 'fs/promises';
import type { Stats } from 'fs';
import path from 'path';

// Import Clack and Kleur for interactive prompts and colors
import { intro, isCancel, log, outro, select, spinner } from '@clack/prompts';
import { bye, getPackageManager } from '../utils/utils'; // Assuming these utils exist
import { bgBlue, bgMagenta, bold, cyan, gray, green, red, yellow } from 'kleur/colors';
import type { AppCommand } from '../utils/app-command'; // Assuming this type exists
import { runInPkg } from '../utils/install-deps';

const DISK_DIR: string = path.resolve('dist');
const SRC_DIR: string = path.resolve('src');
const MANIFEST_PATH: string = path.resolve(DISK_DIR, 'q-manifest.json');
const BUILD_COMMAND: string = 'npm';
const BUILD_ARGS: string[] = ['run', 'build'];

/**
 * Recursively finds the latest modification time (mtime) of any file in the given directory.
 *
 * @param {string} directoryPath - The directory path to search.
 * @returns {Promise<number>} Returns the latest mtime (Unix timestamp in milliseconds), or 0 if the
 *   directory doesn't exist or is empty.
 */
async function getLatestMtime(directoryPath: string): Promise<number> {
  let latestTime = 0;

  async function traverse(dir: string): Promise<void> {
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
          if (stats.mtimeMs > latestTime) {
            latestTime = stats.mtimeMs;
          }
        }
      } catch (err: any) {
        console.warn(`Cannot access ${fullPath}: ${err.message}`);
      }
    }
  }

  await traverse(directoryPath);
  return latestTime;
}

/**
 * Handles the core logic for the 'check-client' command. Exports this function so other modules can
 * import and call it.
 *
 * @param {AppCommand} app - Application command context (assuming structure).
 */
export async function checkClientCommand(app: AppCommand): Promise<void> {
  // Display introductory message
  intro(`🚀 ${bgBlue(bold(' Qiwk Client Check '))}`);
  const pkgManager = getPackageManager();

  let manifestMtime: number = 0;
  let manifestExists: boolean = false;
  let needsBuild: boolean = false;
  const reasonsForBuild: string[] = [];

  // Step 1: Check the manifest file
  log.step(`Checking manifest file: ${cyan(MANIFEST_PATH)}`);
  try {
    // Get stats for the manifest file
    const stats: Stats = await fs.stat(MANIFEST_PATH); // Use the resolved path
    manifestMtime = stats.mtimeMs;
    manifestExists = true;
    log.info(`Manifest file found, modified: ${gray(new Date(manifestMtime).toLocaleString())}`);
  } catch (err: any) {
    // Handle errors accessing the manifest file
    if (err.code === 'ENOENT') {
      log.warn(`Manifest file not found: ${yellow(MANIFEST_PATH)}`);
      needsBuild = true;
      reasonsForBuild.push('Manifest file not found');
    } else {
      log.error(`Error accessing manifest file ${MANIFEST_PATH}: ${err.message}`);
      needsBuild = true;
      reasonsForBuild.push(`Cannot access manifest file (${err.code})`);
    }
  }

  // Step 2: Check the source directory
  log.step(`Checking source directory: ${cyan(SRC_DIR)}`);
  let latestSrcMtime: number = 0;
  try {
    // Confirm source directory exists and is accessible
    await fs.access(SRC_DIR);
    // Find the latest modification time within the source directory
    latestSrcMtime = await getLatestMtime(SRC_DIR);

    if (latestSrcMtime > 0) {
      log.info(
        `Latest file modification in source directory: ${gray(new Date(latestSrcMtime).toLocaleString())}`
      );
      // Compare source modification time with manifest modification time
      if (manifestExists && latestSrcMtime > manifestMtime) {
        log.warn('Source files are newer than the manifest.');
        needsBuild = true;
        reasonsForBuild.push('Source files (src) are newer than the manifest');
      } else if (manifestExists) {
        log.info('Manifest file is up-to-date relative to source files.');
      }
    } else {
      // Handle case where source directory is empty or inaccessible
      log.info(`No source files found or directory is empty/inaccessible in '${SRC_DIR}'.`);
      // Note: Depending on requirements, you might want to set needsBuild = true here
    }
  } catch (err: any) {
    // Handle errors accessing the source directory
    if (err.code === 'ENOENT') {
      log.error(`Source directory '${SRC_DIR}' not found! Build might fail.`);
      // Decide whether to force build or exit if source directory access fails
      // Setting needsBuild = true might be appropriate if the build process creates it.
    } else {
      log.error(`Error accessing source directory '${SRC_DIR}': ${err.message}`);
      // Consider setting needsBuild = true or exiting based on severity
    }
  }

  // Step 3: Perform build if necessary
  let buildSuccess: boolean | undefined = undefined; // Initialize build success status
  if (needsBuild) {
    log.step(yellow('Client build detected as necessary'));
    // Log reasons why a build is needed
    reasonsForBuild.forEach((reason) => log.info(`  - ${reason}`));

    // Confirm with the user before proceeding with the build
    const proceed: boolean | symbol = await select({
      message: `Proceed with client build based on the reasons above (${cyan(BUILD_COMMAND + ' ' + BUILD_ARGS.join(' '))})?`,
      options: [
        { value: true, label: 'Yes, proceed with build', hint: 'Will run the build command' },
        { value: false, label: 'No, cancel operation' },
      ],
      initialValue: true,
    });

    // Check if the user cancelled the operation
    if (isCancel(proceed) || proceed === false) {
      bye(); // Exit gracefully (assuming bye handles this)
      return; // Stop further execution
    }

    // Show a spinner while the build command runs
    const s = spinner();
    s.start('Running client build...');
    try {
      // Execute the build command
      // Ensure runCommand returns an object with an 'install' promise or similar structure
      const { install } = await runInPkg(pkgManager, BUILD_ARGS, app.rootDir);
      buildSuccess = await install; // Await the promise indicating build completion/success

      if (buildSuccess) {
        s.stop(green('Client build completed successfully.'));
        // **Important:** Re-check manifest mtime after successful build
        try {
          const newStats = await fs.stat(MANIFEST_PATH);
          manifestMtime = newStats.mtimeMs;
          manifestExists = true; // Mark as existing now
          log.info(`Manifest updated: ${gray(new Date(manifestMtime).toLocaleString())}`);
        } catch (statErr: any) {
          log.error(`Failed to re-stat manifest after build: ${statErr.message}`);
          // Handle this case - maybe the build didn't create the manifest?
        }
      } else {
        // Handle build failure reported by runCommand
        s.stop(red('Client build failed.'), 1);
        throw new Error('Client build command reported failure.');
      }
    } catch (buildError: any) {
      // Catch errors during the build process itself (e.g., command not found, script errors)
      s.stop(red('Client build failed.'), 1);
      log.error(`Build error: ${buildError.message}`);
      // Throw error to indicate failure, let the caller handle exit logic if needed
      throw new Error('Client build process encountered an error.');
    }
  } else {
    // If no build was needed
    log.info(green('Client is up-to-date, no build needed.'));
  }

  // Step 4: Check the Disk directory (usually after build)
  log.step(`Checking Disk directory: ${cyan(DISK_DIR)}`);
  try {
    // Check if the disk directory exists and is accessible
    await fs.access(DISK_DIR);
    log.info(`Disk directory found: ${green(DISK_DIR)}`);
  } catch (err: any) {
    // Handle errors accessing the disk directory
    if (err.code === 'ENOENT') {
      log.warn(`Disk directory not found: ${yellow(DISK_DIR)}`);
      // Provide context if a build just happened
      if (needsBuild && buildSuccess === true) {
        // Check if build was attempted and successful
        log.warn(
          `Note: Build completed, but '${DISK_DIR}' directory was not found. The build process might not create it.`
        );
      } else if (needsBuild && !buildSuccess) {
        log.warn(`Note: Build failed, and '${DISK_DIR}' directory was not found.`);
      }
    } else {
      log.error(`Error accessing disk directory ${DISK_DIR}: ${err.message}`);
    }
  }

  // Display completion message
  outro(`✅ ${bgMagenta(bold(' Check complete '))}`);
}

import fs from 'fs/promises';
import type { Stats } from 'fs';

import { log } from '@clack/prompts';
import { panic } from '../utils/utils';
import { yellow } from 'kleur/colors';
import { DISK_DIR, MANIFEST_PATH } from './constant';

/**
 * Retrieves the last modified timestamp of the manifest file.
 *
 * @param {string} manifestPath - The path to the manifest file.
 * @returns {Promise<number | null>} Returns the last modified timestamp (in milliseconds) of the
 *   manifest file, or null if an error occurs.
 */
export async function getManifestFile(manifestPath: string = MANIFEST_PATH) {
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

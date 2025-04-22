import fs from 'fs/promises';

import { log } from '@clack/prompts';
import { panic } from '../utils/utils';
import { yellow } from 'kleur/colors';
import { DISK_DIR } from './constant';

/**
 * Checks if the specified disk directory exists and is accessible.
 *
 * @returns {Promise<boolean>} Returns true if the directory exists and can be accessed, returns
 *   false if it doesn't exist or an error occurs.
 */
export async function isCheckDisk(): Promise<boolean> {
  try {
    await fs.access(DISK_DIR);
    return true; // Directory exists
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      log.warn(`Disk directory not found: ${yellow(DISK_DIR)}`);
    } else {
      panic(`Error accessing disk directory ${DISK_DIR}: ${err.message}`);
    }
    return false; // Directory doesn't exist or there was an error
  }
}

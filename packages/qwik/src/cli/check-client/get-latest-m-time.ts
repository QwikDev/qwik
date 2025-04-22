import path from 'path';
import fs from 'fs/promises';

/**
 * Recursively finds the latest modification time (mtime) of any file in the given directory.
 *
 * @param {string} directoryPath - The directory path to search.
 * @returns {Promise<number>} Returns the latest mtime (Unix timestamp in milliseconds), or 0 if the
 *   directory doesn't exist or is empty.
 */
export async function getLatestMtime(directoryPath: string, timestamp: number): Promise<boolean> {
  let returnValue = false;
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

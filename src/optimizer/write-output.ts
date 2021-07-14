import type { OutputFile } from './types';
import { platform } from './utils';

/**
 * Utility function to async write files to disk.
 * @public
 */
export async function writeOutput(opts: { dir: string; files: OutputFile[]; emptyDir?: boolean }) {
  if (platform === 'node') {
    const path = await import('path');
    const fs = await import('fs/promises');

    if (opts.emptyDir) {
      await fs.rm(opts.dir, { recursive: true, force: true });
    }

    const files = opts.files.map((o) => ({
      ...o,
      filePath: path.join(opts.dir, o.path),
    }));

    const ensureDirs = Array.from(new Set(files.map((f) => path.dirname(f.filePath))));
    for (const dir of ensureDirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (e) {
        /**/
      }
    }

    await Promise.all(files.map((f) => fs.writeFile(f.filePath, f.text)));
  } else {
    throw new Error(`Unsupported platform to write files with`);
  }
}

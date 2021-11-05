import type { BuildConfig } from './util';
import { copyFile } from './util';
import { basename, join } from 'path';

/**
 * Manually copy some root files, such as README.md and LICENSE
 * to the published package directory.
 */
export async function copyFiles(config: BuildConfig) {
  const rootFiles = ['README.md', 'LICENSE'];

  await Promise.all(
    rootFiles.map((f) => {
      copyFile(join(config.rootDir, f), join(config.distPkgDir, basename(f)));
    })
  );
}

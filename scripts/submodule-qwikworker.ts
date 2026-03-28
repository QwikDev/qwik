import { join } from 'node:path';
import { copyFile, fileSize, type BuildConfig } from './util.ts';

export async function submoduleQwikWorker(config: BuildConfig): Promise<void> {
  const srcPath = join(config.srcQwikDir, 'web-worker', 'worker.js');
  const destPath = join(config.distQwikPkgDir, 'worker.js');

  await copyFile(srcPath, destPath);

  console.log('🐝 worker.js:', await fileSize(destPath));
}

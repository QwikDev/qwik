import path from 'path';

export const DISK_DIR: string = path.resolve('dist');
export const SRC_DIR: string = path.resolve('src');
export const BUILD_ARGS: string[] = ['run', 'build.client'];
export const MANIFEST_PATH: string = path.resolve(DISK_DIR, 'q-manifest.json');

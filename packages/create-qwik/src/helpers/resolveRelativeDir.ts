import { resolve } from 'path';
import os from 'node:os';

export function resolveRelativeDir(dir: string) {
  // check if the outDir start with home ~
  if (dir.startsWith('~/')) {
    return resolve(os.homedir(), dir);
  } else {
    return resolve(process.cwd(), dir);
  }
}

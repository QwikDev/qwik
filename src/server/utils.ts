import { readFile as fsReadFile, stat as fsStat } from 'fs';
import { promisify } from 'util';

export const readFile = promisify(fsReadFile);
export const stat = promisify(fsStat);

/**
 * Utility timer function for Nodejs performance profiling.
 * @alpha
 */
export function createTimer() {
  const start = process.hrtime();
  return () => {
    const end = process.hrtime(start);
    return (end[0] * 1000000000 + end[1]) / 1000000;
  };
}

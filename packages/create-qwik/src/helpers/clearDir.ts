import fs from 'node:fs';
import { join } from 'node:path';

export const clearDir = async (dir: string) => {
  const files = await fs.promises.readdir(dir);

  return await Promise.all(
    files.map((pathToFile) => fs.promises.rm(join(dir, pathToFile), { recursive: true }))
  );
};

import fs from 'node:fs';
import { basename, join } from 'node:path';
import type { RouteSourceFile } from '../types';
import { normalizePath } from '../../utils/fs';
import { getSourceFile } from './source-file';

export async function walkRoutes(routesDir: string) {
  const sourceFiles: RouteSourceFile[] = [];
  await walkRouteDir(sourceFiles, normalizePath(routesDir), basename(routesDir));
  return sourceFiles;
}

async function walkRouteDir(sourceFiles: RouteSourceFile[], dirPath: string, dirName: string) {
  try {
    const dirItemNames = await fs.promises.readdir(dirPath);

    await Promise.all(
      dirItemNames.map(async (itemName) => {
        const itemPath = normalizePath(join(dirPath, itemName));

        const sourceFileName = getSourceFile(itemName);
        if (sourceFileName !== null) {
          sourceFiles.push({
            ...sourceFileName,
            fileName: itemName,
            filePath: itemPath,
            dirName,
            dirPath,
          });
        } else {
          await walkRouteDir(sourceFiles, itemPath, itemName);
        }
      })
    );
  } catch (e) {
    // errors if the child fs item wasn't a directory, which is fine to ignore
  }
}

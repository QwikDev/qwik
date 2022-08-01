import fs from 'fs';
import { basename, join } from 'path';
import type { RouteSourceFile } from '../types';
import { normalizePath } from '../utils/fs';
import { getSourceFile } from './source-file';

export async function walkRoutes(routesDir: string) {
  const sourceFiles: RouteSourceFile[] = [];
  await walkRouteDir(sourceFiles, normalizePath(routesDir), basename(routesDir));
  return sourceFiles;
}

async function walkRouteDir(sourceFiles: RouteSourceFile[], dirPath: string, dirName: string) {
  const dirItems = await readDir(dirPath);
  if (dirItems !== null) {
    await Promise.all(
      dirItems.map(async (itemName) => {
        const itemPath = normalizePath(join(dirPath, itemName));

        const sourceFile = getSourceFile(dirPath, dirName, itemPath, itemName);
        if (sourceFile) {
          sourceFiles.push(sourceFile);
        } else {
          await walkRouteDir(sourceFiles, itemPath, itemName);
        }
      })
    );
  }
}

async function readDir(dirPath: string) {
  try {
    const dirItemNames = await fs.promises.readdir(dirPath);
    return dirItemNames;
  } catch (e) {
    //
  }
  return null;
}

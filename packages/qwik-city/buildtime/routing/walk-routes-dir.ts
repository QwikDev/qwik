import fs from 'node:fs';
import { basename, join } from 'node:path';
import type { NormalizedPluginOptions, RouteSourceFile } from '../types';
import { normalizePath } from '../../utils/fs';
import { getSourceFile } from './source-file';

export async function walkRoutes(
  routesDir: string,
  structureOpts: NormalizedPluginOptions['structure']
) {
  const sourceFiles: RouteSourceFile[] = [];
  await walkRouteDir(sourceFiles, normalizePath(routesDir), basename(routesDir), structureOpts);
  return sourceFiles;
}

async function walkRouteDir(
  sourceFiles: RouteSourceFile[],
  dirPath: string,
  dirName: string,
  structureOpts: NormalizedPluginOptions['structure']
) {
  try {
    const dirItemNames = await fs.promises.readdir(dirPath);

    await Promise.all(
      dirItemNames.map(async (itemName: string) => {
        const itemPath = normalizePath(join(dirPath, itemName));

        const sourceFileName = getSourceFile(itemName, structureOpts);
        if (sourceFileName !== null) {
          sourceFiles.push({
            ...sourceFileName,
            fileName: itemName,
            filePath: itemPath,
            dirName,
            dirPath,
          });
        } else {
          await walkRouteDir(sourceFiles, itemPath, itemName, structureOpts);
        }
      })
    );
  } catch (e) {
    // errors if the child fs item wasn't a directory, which is fine to ignore
  }
}

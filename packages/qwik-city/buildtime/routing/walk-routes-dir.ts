import fs from 'fs';
import { basename, join } from 'path';
import type { RouteSourceFile } from '../types';
import { isLayoutName, normalizePath } from '../utils/fs';
import { isDynamicSegment, isPathlessSegment } from '../utils/pathname';
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

export async function walkRoutesWithPathname(routesDir: string, pathname: string) {
  const sourceFiles: RouteSourceFile[] = [];
  const segments = pathname.split('/');

  await walkRouteDirWithPathname(
    sourceFiles,
    segments,
    1,
    normalizePath(routesDir),
    basename(routesDir)
  );

  return sourceFiles;
}

async function walkRouteDirWithPathname(
  sourceFiles: RouteSourceFile[],
  segments: string[],
  index: number,
  dirPath: string,
  dirName: string
) {
  const dirItems = await readDir(dirPath);
  if (dirItems !== null) {
    const segmentName = segments[index];
    index++;
    const continueWalk = index <= segments.length;

    await Promise.all(
      dirItems.map(async (itemName) => {
        const itemPath = normalizePath(join(dirPath, itemName));

        const sourceFile = getSourceFile(dirPath, dirName, itemPath, itemName);
        if (sourceFile) {
          sourceFiles.push(sourceFile);
        }

        const sameSegmentName = itemName === segmentName;

        if (
          continueWalk ||
          sameSegmentName ||
          isDynamicSegment(itemName) ||
          isPathlessSegment(itemName) ||
          isLayoutName(itemName)
        ) {
          await walkRouteDirWithPathname(sourceFiles, segments, index, itemPath, itemName);
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

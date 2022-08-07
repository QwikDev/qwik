import { basename, extname } from 'path';
import type { BuildContext, RouteSourceFile, RouteSourceFileName, RouteSourceType } from '../types';
import { addError } from '../utils/format';
import { isEntryName, isErrorName, isMarkdownExt, isMenuFileName, isModuleExt } from '../utils/fs';

export function getSourceFile(fileName: string) {
  const ext = extname(fileName).toLowerCase();
  const extlessName = basename(fileName, ext);
  const isModule = isModuleExt(ext);
  let type: RouteSourceType | null = null;

  if (extlessName.startsWith('index') && (isModule || isMarkdownExt(ext))) {
    // index@layoutname or index!
    type = 'route';
  } else if (isModule) {
    if (extlessName.startsWith('layout')) {
      // layout-name or layout!
      type = 'layout';
    } else if (isEntryName(extlessName)) {
      // entry.ts
      type = 'entry';
    } else if (isErrorName(extlessName)) {
      // 404 or 500
      type = 'error';
    }
  } else if (isMenuFileName(fileName)) {
    // menu.md
    type = 'menu';
  }

  if (type !== null) {
    const sourceFileName: RouteSourceFileName = {
      type,
      extlessName,
      ext,
    };
    return sourceFileName;
  }

  return null;
}

export function validateSourceFiles(ctx: BuildContext, sourceFiles: RouteSourceFile[]) {
  for (const sourceFile of sourceFiles) {
    const err = validateSourceFile(sourceFile);
    if (err) {
      addError(ctx, err);
    }
  }
}

function validateSourceFile(sourceFile: RouteSourceFile) {
  // if (isTestDirName(sourceFile.dirName)) {
  //   return `Test directory "${sourceFile.filePath}" should not be included within the routes directory. Please move test directories to a different location.`;
  // }

  // if (isTestFileName(sourceFile.fileName)) {
  //   return `Test file "${sourceFile.filePath}" should not be included within the routes directory. Please move test files to a different location.`;
  // }

  // if (sourceFile.dirName.includes('@')) {
  //   return `Route directories cannot have a named layout. Please change the named layout from the directory "${sourceFile.dirPath}" to a file.`;
  // }

  return null;
}

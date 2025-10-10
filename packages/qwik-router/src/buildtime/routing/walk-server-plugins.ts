import fs from 'node:fs';
import { join } from 'node:path';
import type { BuiltServerPlugin, NormalizedPluginOptions } from '../types';
import {
  createFileId,
  getExtension,
  isModuleExt,
  isPageModuleExt,
  isPluginModule,
  normalizePath,
  removeExtension,
} from '../../utils/fs';

export async function walkServerPlugins(opts: NormalizedPluginOptions) {
  const dirPath = opts.serverPluginsDir;
  const dirItemNames = await fs.promises.readdir(dirPath);
  const sourceFiles: BuiltServerPlugin[] = [];
  await Promise.all(
    dirItemNames.map(async (itemName) => {
      const itemPath = normalizePath(join(dirPath, itemName));
      const ext = getExtension(itemName);
      const extlessName = removeExtension(itemName);

      if ((isModuleExt(ext) || isPageModuleExt(ext)) && isPluginModule(extlessName)) {
        sourceFiles.push({
          id: createFileId(opts.serverPluginsDir, itemPath, 'Plugin'),
          filePath: itemPath,
          ext,
        });
      }
    })
  );
  return sourceFiles;
}

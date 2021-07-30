/**
 * Contains utilities to allow qwik client to prefetch javascript before it is needed.
 */

import { readFile as nodeReadFile } from 'fs';
import { join } from 'path';

/**
 * Returns a list of imports for a JavaScript file.
 * @param file contents of JS file
 */
export function getImportsFromSource(file: string): string[] {
  const imports: string[] = [];
  const regex = /[import|from]\s+(['"`])(\..*)\1/g;
  let match = regex.exec(file);
  while (match != null) {
    imports.push(match[2]);
    match = regex.exec(file);
  }
  return imports;
}

/**
 * Basic implementation
 */
export function readFile(filePath: string): Promise<string> {
  return new Promise((res, rej) =>
    nodeReadFile(filePath, (err, data) => (err ? rej(err) : res(String(data))))
  );
}

export async function getImports(
  file: string,
  readFileFn: (path: string) => Promise<string> = readFile
): Promise<string[]> {
  const imports: string[] = [];
  await Promise.all(
    getImportsFromSource(await readFileFn(file)).map(async (fileImport) => {
      let resolvedFile = join(file, '..', fileImport);
      if (!resolvedFile.startsWith('.')) {
        resolvedFile = './' + resolvedFile;
      }
      imports.push(resolvedFile, ...(await getImports(resolvedFile, readFileFn)));
    })
  );
  return imports;
}

import { createPath } from '../core/util/path';

/**
 * Returns a list of imports for a JavaScript file.
 * @param file contents of JS file
 * @internal
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
 * Returns a set of imports for a given source file.
 *
 * The function recursively visits the dependencies and returns a fully populated graph.
 *
 * This does not take dynamic imports into the account and so it produces an incomplete list.
 *
 * @param filePath - File path to read
 * @param readFileFn - a function used to retrieve the contents of a file at a given `filePath`
 * @alpha
 */
export async function getImports(
  filePath: string,
  readFileFn: (path: string) => Promise<string>
): Promise<string[]> {
  const imports: string[] = [];
  const path = createPath();
  await Promise.all(
    getImportsFromSource(await readFileFn(filePath)).map(async (fileImport) => {
      let resolvedFile = path.join(filePath, '..', fileImport);
      if (!resolvedFile.startsWith('.')) {
        resolvedFile = './' + resolvedFile;
      }
      imports.push(resolvedFile, ...(await getImports(resolvedFile, readFileFn)));
    })
  );
  return imports;
}

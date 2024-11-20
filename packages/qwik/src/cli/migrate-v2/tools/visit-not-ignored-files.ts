import { existsSync, lstatSync, readFileSync, readdirSync } from 'fs';
import ignore from 'ignore';
import { join, relative } from 'path';

/** Utility to act on all files in a tree that are not ignored by git. */
export function visitNotIgnoredFiles(dirPath: string, visitor: (path: string) => void): void {
  let ig: ReturnType<typeof ignore> | undefined;
  if (existsSync('.gitignore')) {
    ig = ignore();
    ig.add('.git');
    ig.add(readFileSync('.gitignore', 'utf-8'));
  }
  dirPath = relative(process.cwd(), dirPath);
  if (dirPath !== '' && ig?.ignores(dirPath)) {
    return;
  }
  for (const child of readdirSync(join(process.cwd(), dirPath))) {
    const fullPath = join(dirPath, child);
    if (ig?.ignores(fullPath)) {
      continue;
    }
    if (lstatSync(fullPath).isFile()) {
      visitor(fullPath);
    } else {
      visitNotIgnoredFiles(fullPath, visitor);
    }
  }
}

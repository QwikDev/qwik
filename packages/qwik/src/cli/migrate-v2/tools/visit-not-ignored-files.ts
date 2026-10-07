import { existsSync, lstatSync, readFileSync, readdirSync } from 'fs';
import ignore from 'ignore';
import { join, posix, relative, sep } from 'path';

/** Visits the files not ignored by git, with `/`-separated paths on every OS. */
export function visitNotIgnoredFiles(dirPath: string, visitor: (path: string) => void): void {
  const ig = ignore().add(['.git', 'node_modules']);
  if (existsSync('.gitignore')) {
    ig.add(readFileSync('.gitignore', 'utf-8'));
  }
  dirPath = relative(process.cwd(), dirPath).split(sep).join('/');
  if (dirPath !== '' && ig.ignores(dirPath)) {
    return;
  }
  for (const child of readdirSync(join(process.cwd(), dirPath))) {
    const fullPath = posix.join(dirPath, child);
    if (ig.ignores(fullPath)) {
      continue;
    }
    if (lstatSync(fullPath).isFile()) {
      visitor(fullPath);
    } else {
      visitNotIgnoredFiles(fullPath, visitor);
    }
  }
}

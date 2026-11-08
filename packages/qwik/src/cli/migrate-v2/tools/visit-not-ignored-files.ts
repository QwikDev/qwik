import { existsSync, lstatSync, readFileSync, readdirSync } from 'fs';
import ignore from 'ignore';
import { join, posix, relative, sep } from 'path';

/** Visits the files not ignored by git, with `/`-separated paths on every OS. */
export function visitNotIgnoredFiles(dirPath: string, visitor: (path: string) => void): void {
  const ig = ignore();
  if (existsSync('.gitignore')) {
    ig.add(readFileSync('.gitignore', 'utf-8'));
  }
  // after the project rules, so a negation can't re-include them
  ig.add(['.git', 'node_modules']);
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

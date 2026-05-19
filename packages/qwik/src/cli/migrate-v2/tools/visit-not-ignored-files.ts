import { existsSync, lstatSync, readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';

/** Utility to act on all files in a tree that are not ignored by git. */
export async function visitNotIgnoredFiles(
  dirPath: string,
  visitor: (path: string) => void
): Promise<void> {
  const { default: ignore } = await import('ignore');
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
  const dirResults = readdirSync(join(process.cwd(), dirPath));
  for (let i = 0; i < dirResults.length; i++) {
    const child = dirResults[i];
    const fullPath = join(dirPath, child);
    if (ig?.ignores(fullPath)) {
      continue;
    }
    if (lstatSync(fullPath).isFile()) {
      visitor(fullPath);
    } else {
      await visitNotIgnoredFiles(fullPath, visitor);
    }
  }
}

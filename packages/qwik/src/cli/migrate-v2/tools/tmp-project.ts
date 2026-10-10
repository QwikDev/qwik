import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

/** Test helper: creates a temporary project directory, writes the files and makes it the cwd. */
export function createTmpProject(files: Record<string, string>) {
  const prevCwd = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'qwik-migrate-v2-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  process.chdir(dir);
  return {
    dir,
    read: (path: string) => readFileSync(join(dir, path), 'utf-8'),
    exists: (path: string) => existsSync(join(dir, path)),
    cleanup: () => {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

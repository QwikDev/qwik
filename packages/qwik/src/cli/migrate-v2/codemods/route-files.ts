import { existsSync, renameSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import type { Project } from 'ts-morph';
import { warn } from '../report';
import { visitNotIgnoredFiles } from '../tools/visit-not-ignored-files';

const ROUTE_FILE = /\.(tsx|ts|jsx|js|mdx|md)$/;

/**
 * `error.tsx` (and `error!`, `error@name`) are error boundaries in v2, v1 ignored those files. They
 * are renamed so they keep being plain modules. Numeric files like `500.tsx` were routes in v1.
 */
export const renameV2ErrorBoundaryFiles = (project: Project) => {
  visitNotIgnoredFiles('.', (path) => {
    if (!/(^|\/)routes\//.test(path) || !ROUTE_FILE.test(path)) {
      return;
    }
    const name = basename(path).replace(ROUTE_FILE, '');
    if (/^error(|!|@.+)$/.test(name)) {
      const newPath = join(dirname(path), `_${basename(path)}`);
      if (existsSync(newPath)) {
        warn(path, `this file is an error boundary in v2, rename it (${newPath} already exists).`);
        return;
      }
      const sourceFile = project.getSourceFile(path);
      if (sourceFile) {
        // updates the imports of the file
        sourceFile.move(resolve(newPath));
      } else {
        renameSync(path, newPath);
      }
      warn(path, `renamed to ${newPath}, v2 would render it as the error page.`);
    } else if (parseInt(name, 10) >= 400 && parseInt(name, 10) <= 599) {
      warn(path, 'v1 served this file as a route, v2 ignores it (only `404` is a special name).');
    }
  });
};

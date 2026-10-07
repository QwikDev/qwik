import { afterEach, describe, expect, test } from 'vitest';
import { createTmpProject } from './tmp-project';
import { visitNotIgnoredFiles } from './visit-not-ignored-files';

describe('visitNotIgnoredFiles', () => {
  let project: ReturnType<typeof createTmpProject>;
  afterEach(() => project.cleanup());

  const visit = () => {
    const visited: string[] = [];
    visitNotIgnoredFiles('.', (path) => visited.push(path));
    return visited.sort();
  };

  test('visits all files recursively', () => {
    project = createTmpProject({ 'a.ts': '', 'src/b.tsx': '', 'src/deep/c.json': '' });
    expect(visit()).toEqual(['a.ts', 'src/b.tsx', 'src/deep/c.json']);
  });

  test('skips files and directories ignored by .gitignore and the .git directory', () => {
    project = createTmpProject({
      '.gitignore': 'node_modules\n*.log\ndist/\n',
      '.git/config': '',
      'a.ts': '',
      'debug.log': '',
      'node_modules/pkg/index.js': '',
      'dist/out.js': '',
      'src/b.ts': '',
    });
    expect(visit()).toEqual(['.gitignore', 'a.ts', 'src/b.ts']);
  });
});

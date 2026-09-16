import { afterEach, describe, expect, test, vi } from 'vitest';
import { takeWarnings } from '../report';
import { createTmpProject } from '../tools/tmp-project';
import { codemods, projectCodemods } from './index';
import { runCodemods } from './run-codemods';

vi.mock('@clack/prompts', () => ({ log: { info: vi.fn() } }));

describe('renameV2ErrorBoundaryFiles', () => {
  let project: ReturnType<typeof createTmpProject>;
  afterEach(() => {
    project.cleanup();
    takeWarnings();
  });

  test('renames files that are error boundaries in v2 and updates their imports', () => {
    project = createTmpProject({
      'src/routes/docs/error.tsx': `export const Error = () => null;`,
      'src/routes/docs/index.tsx': `import { Error } from './error';\nexport default Error;`,
      'src/routes/error@admin.mdx': `# error`,
      'src/routes/500.tsx': `export default () => null;`,
      'src/components/error.tsx': `export const x = 1;`,
    });
    runCodemods([], projectCodemods);
    expect(project.exists('src/routes/docs/error.tsx')).toBe(false);
    expect(project.read('src/routes/docs/_error.tsx')).toBe(`export const Error = () => null;`);
    expect(project.read('src/routes/docs/index.tsx')).toBe(
      `import { Error } from './_error';\nexport default Error;`
    );
    expect(project.exists('src/routes/_error@admin.mdx')).toBe(true);
    expect(project.exists('src/components/error.tsx')).toBe(true);
    expect(takeWarnings()).toHaveLength(3);
  });

  test('all file codemods run on a project without changes', () => {
    project = createTmpProject({ 'src/a.ts': `export const a = 1;` });
    runCodemods(codemods, projectCodemods);
    expect(project.read('src/a.ts')).toBe(`export const a = 1;`);
  });
});

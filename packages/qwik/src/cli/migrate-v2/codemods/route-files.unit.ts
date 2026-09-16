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

describe('addNavigationProbeLoaders', () => {
  let project: ReturnType<typeof createTmpProject>;
  afterEach(() => {
    project.cleanup();
    takeWarnings();
  });

  test('adds loaders to the root layout and pages with handlers', () => {
    project = createTmpProject({
      'src/routes/plugin@auth.ts': `export const onRequest = () => {};`,
      'src/routes/layout.tsx': `import { component$, Slot } from '@builder.io/qwik';\nexport default component$(() => <Slot />);`,
      'src/routes/admin/index.tsx': `import { component$ } from '@builder.io/qwik';\nimport type { RequestHandler } from '@builder.io/qwik-city';\nexport const onGet: RequestHandler = () => {};\nexport default component$(() => <div />);`,
      'src/routes/about/index.tsx': `export default () => <div />;`,
    });
    runCodemods([], projectCodemods);
    expect(project.read('src/routes/layout.tsx')).toBe(
      `import { routeLoader$ } from '@builder.io/qwik-city';\nimport { component$, Slot } from '@builder.io/qwik';\nexport default component$(() => <Slot />);\nexport const useV1NavigationProbe = routeLoader$(() => null);`
    );
    expect(project.read('src/routes/admin/index.tsx')).toBe(
      `import { routeLoader$ } from '@builder.io/qwik-city';\nimport { component$ } from '@builder.io/qwik';\nimport type { RequestHandler } from '@builder.io/qwik-city';\nexport const onGet: RequestHandler = () => {};\nexport default component$(() => <div />);\nexport const useV1NavigationProbe = routeLoader$(() => null);`
    );
    expect(project.read('src/routes/about/index.tsx')).toBe(`export default () => <div />;`);
    expect(takeWarnings()).toHaveLength(1);
  });

  test('creates a root layout and skips layouts that already have a loader', () => {
    project = createTmpProject({
      'src/routes/index.tsx': `export const onGet = () => {};\nexport default () => <div />;`,
    });
    runCodemods([], projectCodemods);
    expect(project.read('src/routes/layout.ts')).toContain(
      'export const useV1NavigationProbe = routeLoader$(() => null);'
    );
    project.cleanup();
    project = createTmpProject({
      'src/routes/plugin.ts': `export const onRequest = () => {};`,
      'src/routes/layout.tsx': `import { routeLoader$ } from '@builder.io/qwik-city';\nexport const useUser = routeLoader$(() => 1);`,
    });
    runCodemods([], projectCodemods);
    expect(project.read('src/routes/layout.tsx')).not.toContain('useV1NavigationProbe');
  });

  test('does nothing without middleware', () => {
    project = createTmpProject({ 'src/routes/index.tsx': `export default () => <div />;` });
    runCodemods([], projectCodemods);
    expect(project.exists('src/routes/layout.ts')).toBe(false);
  });
});

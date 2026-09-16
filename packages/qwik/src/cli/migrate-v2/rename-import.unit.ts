import { afterEach, describe, expect, test, vi } from 'vitest';
import { Project } from 'ts-morph';
import { renameImports, replaceImportInFiles } from './rename-import';
import { createTmpProject } from './tools/tmp-project';

vi.mock('@clack/prompts', () => ({ log: { info: vi.fn(), warn: vi.fn() } }));

describe('replaceImportInFiles', () => {
  let project: ReturnType<typeof createTmpProject>;
  afterEach(() => project.cleanup());

  test('renames named imports from the library and their usages', () => {
    project = createTmpProject({
      'src/root.tsx': [
        `import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city';`,
        `export default () => <QwikCityProvider><RouterOutlet /></QwikCityProvider>;`,
      ].join('\n'),
    });
    replaceImportInFiles([['QwikCityProvider', 'QwikRouterProvider']], '@builder.io/qwik-city');
    expect(project.read('src/root.tsx')).toBe(
      [
        `import { QwikRouterProvider, RouterOutlet } from '@builder.io/qwik-city';`,
        `export default () => <QwikRouterProvider><RouterOutlet /></QwikRouterProvider>;`,
      ].join('\n')
    );
  });

  test('matches nested module specifiers of the library', () => {
    project = createTmpProject({
      'src/entry.preview.tsx': [
        `import { createQwikCity } from '@builder.io/qwik-city/middleware/node';`,
        `export default createQwikCity({});`,
      ].join('\n'),
    });
    replaceImportInFiles([['createQwikCity', 'createQwikRouter']], '@builder.io/qwik-city');
    expect(project.read('src/entry.preview.tsx')).toBe(
      [
        `import { createQwikRouter } from '@builder.io/qwik-city/middleware/node';`,
        `export default createQwikRouter({});`,
      ].join('\n')
    );
  });

  test('does not rename identifiers in files that do not import the name', () => {
    const content = `const qwikCity = 1;\nexport const jsxs = qwikCity;`;
    project = createTmpProject({ 'src/a.ts': content });
    replaceImportInFiles([['qwikCity', 'qwikRouter']], '@builder.io/qwik-city');
    expect(project.read('src/a.ts')).toBe(content);
  });

  test('only processes .ts and .tsx files', () => {
    const content = `import { qwikCity } from '@builder.io/qwik-city/vite';\nqwikCity();`;
    project = createTmpProject({ 'vite.config.mjs': content });
    replaceImportInFiles([['qwikCity', 'qwikRouter']], '@builder.io/qwik-city');
    expect(project.read('vite.config.mjs')).toBe(content);
  });
});

describe('renameImports', () => {
  const run = (code: string, changes: [string, string][], library = '@builder.io/qwik-city') => {
    const file = new Project({ useInMemoryFileSystem: true }).createSourceFile('a.tsx', code);
    const changed = renameImports(file, changes, library);
    return { changed, text: file.getFullText() };
  };

  test('returns false when nothing matches', () => {
    expect(run(`import { a } from 'x';`, [['a', 'b']])).toEqual({
      changed: false,
      text: `import { a } from 'x';`,
    });
  });

  test('keeps the alias and its usages for aliased imports', () => {
    expect(
      run(`import { qwikCity as city } from '@builder.io/qwik-city/vite';\ncity();`, [
        ['qwikCity', 'qwikRouter'],
      ]).text
    ).toBe(`import { qwikRouter as city } from '@builder.io/qwik-city/vite';\ncity();`);
  });

  test('renames default imports and their usages', () => {
    expect(
      run(
        `import qwikCityPlan from '@qwik-city-plan';\nexport default f({ plan: qwikCityPlan });`,
        [['qwikCityPlan', 'qwikRouterConfig']],
        '@qwik-city-plan'
      ).text
    ).toBe(
      `import qwikRouterConfig from '@qwik-city-plan';\nexport default f({ plan: qwikRouterConfig });`
    );
  });

  test('keeps property names and shorthand property keys', () => {
    expect(
      run(
        [
          `import qwikCityPlan from '@qwik-city-plan';`,
          `const a = { qwikCityPlan };`,
          `const b = { qwikCityPlan: 1 };`,
          `b.qwikCityPlan;`,
          `interface C { qwikCityPlan: string }`,
        ].join('\n'),
        [['qwikCityPlan', 'qwikRouterConfig']],
        '@qwik-city-plan'
      ).text
    ).toBe(
      [
        `import qwikRouterConfig from '@qwik-city-plan';`,
        `const a = { qwikCityPlan: qwikRouterConfig };`,
        `const b = { qwikCityPlan: 1 };`,
        `b.qwikCityPlan;`,
        `interface C { qwikCityPlan: string }`,
      ].join('\n')
    );
  });

  test('renames type references and JSX tags', () => {
    expect(
      run(
        [
          `import { type QwikCityProps, QwikCityProvider } from '@builder.io/qwik-city';`,
          `const p: QwikCityProps = {};`,
          `<QwikCityProvider {...p}></QwikCityProvider>;`,
        ].join('\n'),
        [
          ['QwikCityProps', 'QwikRouterProps'],
          ['QwikCityProvider', 'QwikRouterProvider'],
        ]
      ).text
    ).toBe(
      [
        `import { type QwikRouterProps, QwikRouterProvider } from '@builder.io/qwik-city';`,
        `const p: QwikRouterProps = {};`,
        `<QwikRouterProvider {...p}></QwikRouterProvider>;`,
      ].join('\n')
    );
  });
});

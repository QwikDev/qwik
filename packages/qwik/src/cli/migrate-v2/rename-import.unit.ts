import { describe, expect, test } from 'vitest';
import { createProject } from './codemods/run-codemods';
import { renameImports } from './rename-import';

describe('renameImports', () => {
  const run = (code: string, changes: [string, string][], library = '@builder.io/qwik-city') => {
    const file = createProject({ useInMemoryFileSystem: true }).createSourceFile('a.tsx', code);
    const changed = renameImports(file, changes, library);
    return { changed, text: file.getFullText() };
  };

  test('returns false when nothing matches', () => {
    expect(run(`import { a } from 'x';`, [['a', 'b']])).toEqual({
      changed: false,
      text: `import { a } from 'x';`,
    });
  });

  test('renames named imports of the library and its subpaths and their usages', () => {
    expect(
      run(
        [
          `import { QwikCityProvider } from '@builder.io/qwik-city';`,
          `import { createQwikCity } from '@builder.io/qwik-city/middleware/node';`,
          `export default () => <QwikCityProvider>{createQwikCity({})}</QwikCityProvider>;`,
        ].join('\n'),
        [
          ['QwikCityProvider', 'QwikRouterProvider'],
          ['createQwikCity', 'createQwikRouter'],
        ]
      )
    ).toEqual({
      changed: true,
      text: [
        `import { QwikRouterProvider } from '@builder.io/qwik-city';`,
        `import { createQwikRouter } from '@builder.io/qwik-city/middleware/node';`,
        `export default () => <QwikRouterProvider>{createQwikRouter({})}</QwikRouterProvider>;`,
      ].join('\n'),
    });
  });

  test('does not rename identifiers in files that do not import the name', () => {
    const code = `const qwikCity = 1;\nexport const jsxs = qwikCity;`;
    expect(run(code, [['qwikCity', 'qwikRouter']])).toEqual({ changed: false, text: code });
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

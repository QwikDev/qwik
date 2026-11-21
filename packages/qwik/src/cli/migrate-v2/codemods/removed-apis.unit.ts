import { createProject } from './run-codemods';
import { afterEach, describe, expect, test } from 'vitest';
import { takeWarnings } from '../report';
import { warnRemovedApis } from './removed-apis';

const run = (code: string) =>
  warnRemovedApis(createProject({ useInMemoryFileSystem: true }).createSourceFile('a.tsx', code));

describe('warnRemovedApis', () => {
  afterEach(() => takeWarnings());

  test('warns about removed core and router APIs', () => {
    expect(
      run(
        [
          `import { component$, useErrorBoundary, SSRHint } from '@builder.io/qwik';`,
          `import { ErrorBoundary, routeLoader$ } from '@builder.io/qwik-city';`,
        ].join('\n')
      )
    ).toBe(false);
    expect(takeWarnings().map((w) => w.split(' ')[1])).toEqual([
      '`useErrorBoundary`',
      '`SSRHint`',
      '`ErrorBoundary`',
    ]);
  });

  test('warns about removed server and optimizer types', () => {
    run(
      [
        `import { renderToStream, type PrefetchStrategy } from '@builder.io/qwik/server';`,
        `import { qwikVite, symbolMapper, type TranspileOption } from '@builder.io/qwik/optimizer';`,
      ].join('\n')
    );
    expect(takeWarnings().map((w) => w.split(' ')[1])).toEqual([
      '`PrefetchStrategy`',
      '`symbolMapper`',
      '`TranspileOption`',
    ]);
  });

  test('ignores other modules', () => {
    run(`import { ErrorBoundary } from './error-boundary';`);
    expect(takeWarnings()).toEqual([]);
  });
});

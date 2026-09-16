import { Project } from 'ts-morph';
import { afterEach, describe, expect, test } from 'vitest';
import { takeWarnings } from '../report';
import { migrateQwikLabs } from './labs';

const run = (code: string, path = 'src/root.tsx') => {
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile(path, code);
  const changed = migrateQwikLabs(file);
  return { changed, text: file.getFullText() };
};

describe('migrateQwikLabs', () => {
  afterEach(() => takeWarnings());

  test('moves Insights to core and removes the props configured by the plugin', () => {
    expect(
      run(
        [
          `import { Insights, untypedAppUrl } from '@builder.io/qwik-labs';`,
          `export default () => (`,
          `  <head>`,
          `    <Insights publicApiKey={import.meta.env.PUBLIC_QWIK_INSIGHTS_KEY} />`,
          `  </head>`,
          `);`,
        ].join('\n')
      )
    ).toEqual({
      changed: true,
      text: [
        `import { Insights } from '@qwik.dev/core/insights';`,
        `import { untypedAppUrl } from '@builder.io/qwik-city';`,
        `export default () => (`,
        `  <head>`,
        `    <Insights />`,
        `  </head>`,
        `);`,
      ].join('\n'),
    });
    expect(takeWarnings()).toEqual([]);
  });

  test('warns about a custom postUrl', () => {
    run(
      `import { Insights } from '@builder.io/qwik-labs';\n<Insights publicApiKey="k" postUrl="https://x/" />;`
    );
    expect(takeWarnings()).toHaveLength(1);
  });

  test('moves the vite plugin, enables the experimental flag and removes qwikTypes', () => {
    expect(
      run(
        [
          `import { qwikVite } from '@builder.io/qwik/optimizer';`,
          `import { qwikInsights, qwikTypes } from '@builder.io/qwik-labs/vite';`,
          `export default {`,
          `  plugins: [qwikVite(), qwikTypes(), qwikInsights({ publicApiKey: 'k' })],`,
          `};`,
        ].join('\n'),
        'vite.config.ts'
      ).text
    ).toBe(
      [
        `import { qwikVite } from '@builder.io/qwik/optimizer';`,
        `import { qwikInsights } from '@qwik.dev/core/insights/vite';`,
        `export default {`,
        `  plugins: [qwikVite({ experimental: ['insights'] }), qwikInsights({ publicApiKey: 'k' })],`,
        `};`,
      ].join('\n')
    );
    expect(takeWarnings()).toEqual([
      '/vite.config.ts: `qwikTypes()` was removed in v2, typed routes are not generated.',
    ]);
  });

  test('adds the flag to existing experimental features', () => {
    expect(
      run(
        [
          `import { qwikVite } from '@builder.io/qwik/optimizer';`,
          `import { qwikInsights } from '@builder.io/qwik-labs/vite';`,
          `qwikVite({ experimental: ['valibot'] });`,
        ].join('\n'),
        'vite.config.ts'
      ).text
    ).toContain(`qwikVite({ experimental: ['valibot', 'insights'] });`);
  });

  test('warns about removed exports and zod schemas', () => {
    run(`import { InsightsPayload, devtoolsJsonSRC } from '@builder.io/qwik-labs';`);
    expect(takeWarnings()).toEqual([
      '/src/root.tsx: `InsightsPayload` is only a type in v2, the zod schema was removed.',
      '/src/root.tsx: `devtoolsJsonSRC` from "@builder.io/qwik-labs" has no replacement in v2.',
    ]);
  });

  test('does nothing without qwik-labs imports', () => {
    const code = `import { Insights } from './insights';\n<Insights publicApiKey="k" />;`;
    expect(run(code)).toEqual({ changed: false, text: code });
  });
});

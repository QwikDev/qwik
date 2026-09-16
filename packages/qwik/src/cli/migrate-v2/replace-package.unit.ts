import { afterEach, describe, expect, test, vi } from 'vitest';
import { removePackage, replacePackage } from './replace-package';
import { createTmpProject } from './tools/tmp-project';

vi.mock('@clack/prompts', () => ({ log: { info: vi.fn(), warn: vi.fn() } }));

describe('replacePackage', () => {
  let project: ReturnType<typeof createTmpProject>;
  afterEach(() => project.cleanup());

  test('renames the dependency key in every package.json and keeps the version', () => {
    project = createTmpProject({
      'package.json': JSON.stringify({
        dependencies: { '@builder.io/qwik-city': '^1.5.0' },
        devDependencies: { other: '1.0.0' },
      }),
      'packages/lib/package.json': JSON.stringify({
        peerDependencies: { '@builder.io/qwik-city': '>=1' },
      }),
    });
    replacePackage('@builder.io/qwik-city', '@qwik.dev/router');
    expect(JSON.parse(project.read('package.json')).dependencies).toEqual({
      '@qwik.dev/router': '^1.5.0',
    });
    expect(JSON.parse(project.read('packages/lib/package.json')).peerDependencies).toEqual({
      '@qwik.dev/router': '>=1',
    });
  });

  test('does not rewrite package.json files without the dependency', () => {
    const content = '{"name":"a",   "dependencies": {"b": "1"}}';
    project = createTmpProject({ 'package.json': content });
    replacePackage('@builder.io/qwik-city', '@qwik.dev/router');
    expect(project.read('package.json')).toBe(content);
  });

  test('replaces mentions in text files', () => {
    project = createTmpProject({
      'src/root.tsx': `import { QwikRouterProvider } from '@builder.io/qwik-city';\nimport '@builder.io/qwik-city/middleware/node';`,
      'README.md': 'Uses @builder.io/qwik-city',
    });
    replacePackage('@builder.io/qwik-city', '@qwik.dev/router');
    expect(project.read('src/root.tsx')).toBe(
      `import { QwikRouterProvider } from '@qwik.dev/router';\nimport '@qwik.dev/router/middleware/node';`
    );
    expect(project.read('README.md')).toBe('Uses @qwik.dev/router');
  });

  test('does not touch lockfiles, changelogs and binary files', () => {
    const content = '@builder.io/qwik-city';
    project = createTmpProject({
      'pnpm-lock.yaml': content,
      'package-lock.json': content,
      'yarn.lock': content,
      'CHANGELOG.md': content,
      'public/image.png': content,
    });
    replacePackage('@builder.io/qwik-city', '@qwik.dev/router');
    for (const file of [
      'pnpm-lock.yaml',
      'package-lock.json',
      'yarn.lock',
      'CHANGELOG.md',
      'public/image.png',
    ]) {
      expect(project.read(file)).toBe(content);
    }
  });

  test('does not replace packages that share the prefix', () => {
    project = createTmpProject({
      'src/a.ts': [
        `import '@builder.io/qwik';`,
        `import '@builder.io/qwik/server';`,
        `import '@builder.io/qwik-labs';`,
        `import '@builder.io/qwik-auth';`,
      ].join('\n'),
    });
    replacePackage('@builder.io/qwik', '@qwik.dev/core');
    expect(project.read('src/a.ts')).toBe(
      [
        `import '@qwik.dev/core';`,
        `import '@qwik.dev/core/server';`,
        `import '@builder.io/qwik-labs';`,
        `import '@builder.io/qwik-auth';`,
      ].join('\n')
    );
  });

  test('treats the package name literally, not as a regular expression', () => {
    project = createTmpProject({ 'src/a.ts': `import '@builderXio/qwik';` });
    replacePackage('@builder.io/qwik', '@qwik.dev/core');
    expect(project.read('src/a.ts')).toBe(`import '@builderXio/qwik';`);
  });

  test('skipDependencies only replaces mentions', () => {
    project = createTmpProject({
      'package.json': JSON.stringify({ dependencies: { '@qwik-city-plan': '1.0.0' } }),
      'src/entry.ts': `import plan from '@qwik-city-plan';`,
    });
    replacePackage('@qwik-city-plan', '@qwik-router-config', true);
    expect(project.read('src/entry.ts')).toBe(`import plan from '@qwik-router-config';`);
  });
});

describe('removePackage', () => {
  let project: ReturnType<typeof createTmpProject>;
  afterEach(() => project.cleanup());

  test('removes the package from all dependency lists', () => {
    const untouched = '{"name":"b"}';
    project = createTmpProject({
      'package.json': JSON.stringify({
        dependencies: { '@builder.io/qwik-labs': '0.1.0', a: '1' },
        devDependencies: { '@builder.io/qwik-labs': '0.1.0' },
      }),
      'packages/b/package.json': untouched,
    });
    removePackage('@builder.io/qwik-labs');
    expect(JSON.parse(project.read('package.json'))).toEqual({
      dependencies: { a: '1' },
      devDependencies: {},
    });
    expect(project.read('packages/b/package.json')).toBe(untouched);
  });
});

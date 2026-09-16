import { afterEach, describe, expect, test, vi } from 'vitest';
import { replaceImportInFiles } from './rename-import';
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

  test('only processes .ts and .tsx files', () => {
    const content = `import { qwikCity } from '@builder.io/qwik-city/vite';\nqwikCity();`;
    project = createTmpProject({ 'vite.config.mjs': content });
    replaceImportInFiles([['qwikCity', 'qwikRouter']], '@builder.io/qwik-city');
    expect(project.read('vite.config.mjs')).toBe(content);
  });
});

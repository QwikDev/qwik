import { Project } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import { removeSetupServiceWorker } from './router';
import type { Codemod } from './run-codemods';

const run = (codemod: Codemod, code: string, path = 'src/a.tsx') => {
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile(path, code);
  const changed = codemod(file);
  return { changed, text: file.getFullText() };
};

describe('removeSetupServiceWorker', () => {
  test('removes the import and the call', () => {
    expect(
      run(
        removeSetupServiceWorker,
        [
          `import { setupServiceWorker } from '@builder.io/qwik-city/service-worker';`,
          ``,
          `setupServiceWorker();`,
          ``,
          `addEventListener('install', () => self.skipWaiting());`,
        ].join('\n'),
        'src/routes/service-worker.ts'
      )
    ).toEqual({
      changed: true,
      text: `addEventListener('install', () => self.skipWaiting());`,
    });
  });

  test('does nothing without the import', () => {
    const code = `setupServiceWorker();`;
    expect(run(removeSetupServiceWorker, code)).toEqual({ changed: false, text: code });
  });
});

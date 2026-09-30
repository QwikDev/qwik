import fs from 'node:fs';
import { afterEach, assert, test, vi } from 'vitest';
import { walkRoutes } from './walk-routes-dir';

afterEach(() => {
  vi.restoreAllMocks();
});

test('route files are ordered by name, not by readdir or stat completion order', async () => {
  const unsortedNames = ['layout.tsx', 'index.tsx', '404.tsx'];
  // Stat completion order differs from readdir order too, so neither can leak into the trie.
  const statDelayMs: Record<string, number> = { 'layout.tsx': 20, 'index.tsx': 1, '404.tsx': 40 };

  vi.spyOn(fs.promises, 'readdir').mockResolvedValue(unsortedNames as any);
  vi.spyOn(fs.promises, 'stat').mockImplementation(async (itemPath) => {
    const name = String(itemPath).split('/').pop()!;
    await new Promise((resolve) => setTimeout(resolve, statDelayMs[name]));
    return { isDirectory: () => false } as fs.Stats;
  });

  const root = await walkRoutes('/app/src/routes');

  assert.deepEqual(
    root._files.map((file) => file.fileName),
    ['404.tsx', 'index.tsx', 'layout.tsx']
  );
});

import { writeFile } from 'node:fs/promises';
import { assert, test, vi } from 'vitest';
import { generateRouteTypes } from './generator';

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(async () => ({ isFile: () => true })),
  writeFile: vi.fn(async () => {}),
}));

test('dashed param names are emitted as quoted property keys', async () => {
  await generateRouteTypes('/app/src', '/app/src/routes', ['/users/[user-id]/']);

  const routesGen = vi
    .mocked(writeFile)
    .mock.calls.find(([file]) => String(file).endsWith('routes.gen.d.ts'))![1] as string;
  assert.include(routesGen, '"user-id": string');
  assert.notInclude(routesGen, ' user-id: string');
});

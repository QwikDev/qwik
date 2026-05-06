import { assert } from 'vitest';
import { testAppSuite } from '../../utils/test-suite';

const test = testAppSuite('Walk Server Plugins');

test('serverPlugins are sorted by filePath', ({ ctx }) => {
  const paths = ctx.serverPlugins.map((p) => p.filePath);
  assert.isAtLeast(paths.length, 2);
  assert.deepEqual(paths, [...paths].sort());
});

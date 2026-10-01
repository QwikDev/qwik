import { _regSymbol } from '@qwik.dev/core';
import { expect, test } from 'vitest';
import { createPlatform } from './platform';

test('resolves symbols registered by core on the server', async () => {
  const symbol = _regSymbol(() => 'registered', 'server-platform-test');
  const platform = createPlatform({}, undefined);

  await expect(
    platform.importSymbol(undefined, null, 'handler_server-platform-test')
  ).resolves.toBe(symbol);
});

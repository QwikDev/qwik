import { _regSymbol } from '@qwik.dev/core';
import { expect, test, vi } from 'vitest';
import { createPlatform } from './platform';

test.each(['_catchError', '_Catch'])('maps %s to the development core facade', (symbol) => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const platform = createPlatform({}, { mapper: {} } as any);
    expect(platform.chunkForSymbol!(symbol, null)).toEqual([
      symbol,
      expect.stringMatching(/@qwik-handlers$/),
    ]);
  } finally {
    log.mockRestore();
  }
});

test('resolves symbols registered by core on the server', async () => {
  const symbol = _regSymbol(() => 'registered', 'server-platform-test');
  const platform = createPlatform({}, undefined);

  await expect(
    platform.importSymbol(undefined, null, 'handler_server-platform-test')
  ).resolves.toBe(symbol);
});

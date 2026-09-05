import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

test('isolates concurrent request events without process.getBuiltinModule', async () => {
  vi.resetModules();
  vi.stubGlobal('process', { ...process, getBuiltinModule: undefined });
  const { runQwikRouter } = await import('./user-response');
  const { getRequestEvent } = await import('../../runtime/src/route-loaders');
  const onRequest = vi.fn();

  const requests = ['/first', '/second'].map((pathname) => {
    const url = new URL(pathname, 'https://example.com');
    return runQwikRouter(
      {
        mode: 'server',
        url,
        request: new Request(url),
        locale: undefined,
        platform: {},
        env: { get: () => undefined },
        getClientConn: () => ({}),
        getWritableStream: vi.fn(),
      },
      { $routeName$: pathname, $params$: {}, $mods$: [] },
      [
        async (event) => {
          onRequest();
          expect(getRequestEvent()).toBe(event);
          await Promise.resolve();
          expect(getRequestEvent()).toBe(event);
        },
      ],
      vi.fn()
    );
  });

  expect(onRequest).toHaveBeenCalledTimes(2);
  await expect(Promise.all(requests.map((run) => run.completion))).resolves.toEqual([
    undefined,
    undefined,
  ]);
  expect(onRequest).toHaveBeenCalledTimes(2);
  expect(getRequestEvent()).toBeUndefined();
});

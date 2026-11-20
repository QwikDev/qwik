import { describe, expect, it, vi } from 'vitest';
import { createRequestEvent } from './request-event-core';
import type { ServerRequestEvent } from './types';
import type { LoadedRoute } from '../../runtime/src/types';
import { RedirectMessage, ServerError } from '@qwik.dev/router/middleware/request-handler';

function createMockServerRequestEvent(
  url = 'http://localhost:3000/test',
  init?: RequestInit
): ServerRequestEvent {
  const mockRequest = new Request(url, init);

  return {
    mode: 'server',
    url: new URL(url),
    locale: undefined,
    platform: {},
    request: mockRequest,
    env: {
      get: vi.fn(),
    },
    getClientConn: vi.fn(() => ({ ip: '127.0.0.1' })),
    getWritableStream: vi.fn(() => {
      const writer = {
        write: vi.fn(),
        close: vi.fn(),
      };
      return {
        getWriter: () => writer,
        locked: false,
        pipeTo: vi.fn(),
      } as any;
    }),
  };
}

const justHiModule = { default: () => 'hi' };
const mockRoute: LoadedRoute = {
  $routeName$: '/',
  $params$: {},
  $mods$: [justHiModule],
};

function createMockRequestEvent(url = 'http://localhost:3000/test', init?: RequestInit) {
  const serverRequestEv = createMockServerRequestEvent(url, init);
  return createRequestEvent(serverRequestEv, mockRoute, [], '/', vi.fn());
}

describe('request-event internalRequest', () => {
  it('should be false for normal page requests', () => {
    const requestEv = createMockRequestEvent();

    expect(requestEv.internalRequest).toBe(false);
  });

  it('should identify q-loader requests', () => {
    const requestEv = createMockRequestEvent(
      'http://localhost:3000/test/q-loader-loader-id.manifest-hash.json'
    );

    expect(requestEv.internalRequest).toBe('loader');
  });

  it('should identify fetch-based action requests', () => {
    const requestEv = createMockRequestEvent('http://localhost:3000/test?qaction=action-id', {
      method: 'POST',
      headers: {
        accept: 'application/json',
      },
    });

    expect(requestEv.internalRequest).toBe('action');
  });

  it('should not identify progressive action form submissions as internal requests', () => {
    const requestEv = createMockRequestEvent('http://localhost:3000/test?qaction=action-id', {
      method: 'POST',
    });

    expect(requestEv.internalRequest).toBe(false);
  });

  it('should not identify invalid GET action requests as internal requests', () => {
    const requestEv = createMockRequestEvent('http://localhost:3000/test?qaction=action-id', {
      headers: {
        accept: 'application/json',
      },
    });

    expect(requestEv.internalRequest).toBe(false);
  });
});

describe('request-event send', () => {
  describe.each([
    new Error('broken response stream'),
    new DOMException('Upstream cancelled', 'AbortError'),
  ])('reports $name stream failures for active requests', (error) => {
    it.each([
      {
        name: 'reading a response body',
        send: (ev: ReturnType<typeof createMockRequestEvent>, error: Error) =>
          ev.send(
            new Response(new ReadableStream({ start: (controller) => controller.error(error) }))
          ),
        sink: () => ({}),
      },
      {
        name: 'writing a response body',
        send: (ev: ReturnType<typeof createMockRequestEvent>) => ev.send(200, 'hello'),
        sink: (error: Error) => ({
          write: () => {
            throw error;
          },
        }),
      },
      {
        name: 'closing an empty response',
        send: (ev: ReturnType<typeof createMockRequestEvent>) => ev.send(new Response(null)),
        sink: (error: Error) => ({
          close: () => {
            throw error;
          },
        }),
      },
    ])('handles failures while $name', async ({ send, sink }) => {
      const serverRequestEv = createMockServerRequestEvent();
      vi.mocked(serverRequestEv.getWritableStream).mockReturnValue(new WritableStream(sink(error)));
      const requestEv = createRequestEvent(serverRequestEv, mockRoute, [], '/', vi.fn());
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        send(requestEv, error);

        expect(requestEv.exited).toBe(true);
        await vi.waitFor(() =>
          expect(consoleError).toHaveBeenCalledWith('Response stream failed:', error)
        );
        expect(consoleError).toHaveBeenCalledTimes(1);
      } finally {
        consoleError.mockRestore();
      }
    });
  });

  it.each([
    ['an abort error', new DOMException('Client disconnected', 'AbortError'), false],
    ['an aborted request', new Error('Client disconnected'), true],
  ] as const)('does not report %s', async (_, error, useAbortReason) => {
    const controller = new AbortController();
    const serverRequestEv = createMockServerRequestEvent(undefined, { signal: controller.signal });
    vi.mocked(serverRequestEv.getWritableStream).mockReturnValue(
      new WritableStream({
        write() {
          controller.abort(useAbortReason ? error : undefined);
          throw error;
        },
      })
    );
    const requestEv = createRequestEvent(serverRequestEv, mockRoute, [], '/', vi.fn());
    const cancel = vi.fn();
    const body = new ReadableStream({
      start: (stream) => stream.enqueue(new TextEncoder().encode('hello')),
      cancel,
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      requestEv.send(new Response(body));

      await vi.waitFor(() => expect(cancel).toHaveBeenCalledWith(error));
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('request-event redirect', () => {
  it('should not cache redirects by default', () => {
    const requestEv = createMockRequestEvent();

    requestEv.headers.set('Cache-Control', 'max-age=3600, public');

    const result = requestEv.redirect(301, '/new-location');

    expect(result).toBeInstanceOf(RedirectMessage);
    expect(requestEv.headers.get('Location')).toBe('/new-location');
    expect(requestEv.headers.get('Cache-Control')).toBeNull();
    expect(requestEv.status()).toBe(301);
  });

  it('should set Cache-Control to no-store for redirects with status > 301', () => {
    const requestEv = createMockRequestEvent();

    const result = requestEv.redirect(307, '/new-location');

    expect(result).toBeInstanceOf(RedirectMessage);
    expect(requestEv.headers.get('Location')).toBe('/new-location');
    expect(requestEv.headers.get('Cache-Control')).toBe('no-store');
    expect(requestEv.status()).toBe(307);
  });

  it('should not exit internal loader requests on redirect', () => {
    const requestEv = createMockRequestEvent(
      'http://localhost:3000/test/q-loader-loader-id.manifest-hash.json'
    );

    const result = requestEv.redirect(302, '/new-location');

    expect(result).toBeInstanceOf(RedirectMessage);
    expect(requestEv.internalRequest).toBe('loader');
    expect(requestEv.exited).toBe(false);
  });

  it('should fix invalid redirect URLs with multiple slashes', () => {
    const requestEv = createMockRequestEvent();

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = requestEv.redirect(302, '/path//with///multiple////slashes');

    expect(result).toBeInstanceOf(RedirectMessage);
    expect(requestEv.headers.get('Location')).toBe('/path/with/multiple/slashes');
    expect(consoleSpy).toHaveBeenCalledWith(
      'Redirect URL /path//with///multiple////slashes is invalid, fixing to /path/with/multiple/slashes'
    );
  });

  it('should fix protocol-relative URL redirects starting with //', () => {
    const requestEv = createMockRequestEvent();

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = requestEv.redirect(302, '//evil.com');

    expect(result).toBeInstanceOf(RedirectMessage);
    expect(requestEv.headers.get('Location')).toBe('/evil.com');
    expect(consoleSpy).toHaveBeenCalledWith(
      'Redirect URL //evil.com is invalid, fixing to /evil.com'
    );
  });

  it('should fix protocol-relative URL redirects with trailing path', () => {
    const requestEv = createMockRequestEvent();

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = requestEv.redirect(302, '//evil.com/path');

    expect(result).toBeInstanceOf(RedirectMessage);
    expect(requestEv.headers.get('Location')).toBe('/evil.com/path');
    expect(consoleSpy).toHaveBeenCalledWith(
      'Redirect URL //evil.com/path is invalid, fixing to /evil.com/path'
    );
  });

  it('should fix URLs with multiple leading slashes', () => {
    const requestEv = createMockRequestEvent();

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = requestEv.redirect(302, '////evil.com');

    expect(result).toBeInstanceOf(RedirectMessage);
    expect(requestEv.headers.get('Location')).toBe('/evil.com');
    expect(consoleSpy).toHaveBeenCalledWith(
      'Redirect URL ////evil.com is invalid, fixing to /evil.com'
    );
    consoleSpy.mockRestore();
  });

  it.each(['/\\evil.com', '\\/evil.com', '\\\\evil.com'])(
    'should fix protocol-relative URL redirects containing backslashes: %s',
    (url) => {
      const requestEv = createMockRequestEvent();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = requestEv.redirect(302, url);

      expect(result).toBeInstanceOf(RedirectMessage);
      expect(requestEv.headers.get('Location')).toBe('/evil.com');
      expect(consoleSpy).toHaveBeenCalledWith(
        `Redirect URL ${url} is invalid, fixing to /evil.com`
      );
      consoleSpy.mockRestore();
    }
  );

  it.each(['/\t/evil.com', '/\n/evil.com', '/\r\\evil.com', '\t//evil.com', '/\t\t/evil.com'])(
    'should fix protocol-relative URL redirects hidden behind tab/LF/CR: %j',
    (url) => {
      // Browsers remove ASCII tab/LF/CR before parsing a URL, so these are
      // protocol-relative redirects to evil.com as well.
      const requestEv = createMockRequestEvent();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = requestEv.redirect(302, url);

      expect(result).toBeInstanceOf(RedirectMessage);
      const location = requestEv.headers.get('Location')!;
      expect(new URL(location, 'http://localhost:3000').host).toBe('localhost:3000');
      expect(location).toBe('/evil.com');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    }
  );

  it('should preserve valid URLs with protocols', () => {
    const requestEv = createMockRequestEvent();

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = requestEv.redirect(302, 'https://qwik.dev');

    expect(result).toBeInstanceOf(RedirectMessage);
    expect(requestEv.headers.get('Location')).toBe('https://qwik.dev');
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should throw error when trying to redirect after headers are sent', () => {
    const requestEv = createMockRequestEvent();

    // Trigger getWritableStream to simulate headers being sent
    requestEv.getWritableStream();

    expect(() => {
      requestEv.redirect(302, '/should-fail');
    }).toThrow('Response already sent');
  });

  it('should create public ServerError instances from requestEv.error()', () => {
    const requestEv = createMockRequestEvent();

    const error = requestEv.error(418, 'teapot');

    expect(error).toBeInstanceOf(ServerError);
    expect(error.status).toBe(418);
    expect(error.data).toBe('teapot');
  });
});

describe('request-event cacheControl', () => {
  it('should set zero-valued directives', () => {
    const requestEv = createMockRequestEvent();

    requestEv.cacheControl({ maxAge: 0, staleWhileRevalidate: 0 });

    expect(requestEv.headers.get('Cache-Control')).toBe('max-age=0, stale-while-revalidate=0');
  });

  it('should not set an empty Cache-Control header', () => {
    const requestEv = createMockRequestEvent();

    requestEv.cacheControl({});

    expect(requestEv.headers.has('Cache-Control')).toBe(false);
  });
});

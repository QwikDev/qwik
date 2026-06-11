import { describe, expect, it, vi } from 'vitest';
import { createRequestEvent } from './request-event';
import { RequestEvIsRewrite } from './request-event-core';
import type { ServerRequestEvent } from './types';
import type { LoadedRoute } from '../../runtime/src/types';
import {
  RedirectMessage,
  RewriteMessage,
  ServerError,
} from '@qwik.dev/router/middleware/request-handler';

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

describe('request-event rewrite', () => {
  it('splits an explicit query off a relative path and drops the fragment', () => {
    const requestEv = createMockRequestEvent('http://localhost:3000/test?original=1');

    const result = requestEv.rewrite('/x?q=1#h');

    expect(result).toBeInstanceOf(RewriteMessage);
    expect(result.pathname).toBe('/x');
    expect(result.search).toBe('?q=1');
    expect(requestEv.sharedMap.get(RequestEvIsRewrite)).toBe(true);
    expect(requestEv.exited).toBe(true);
  });

  it('keeps the original query when the relative target has none', () => {
    const requestEv = createMockRequestEvent('http://localhost:3000/test?original=1');

    const result = requestEv.rewrite('/x');

    expect(result).toBeInstanceOf(RewriteMessage);
    expect(result.pathname).toBe('/x');
    // No explicit query on the target: search stays undefined so the
    // request's original query is kept by the rewrite handler.
    expect(result.search).toBeUndefined();
  });

  it('drops a fragment-only suffix from a relative path', () => {
    const requestEv = createMockRequestEvent();

    const result = requestEv.rewrite('/x#h');

    expect(result.pathname).toBe('/x');
    expect(result.search).toBeUndefined();
  });

  it('normalizes a same-origin absolute URL to its path and query, dropping the fragment', () => {
    const requestEv = createMockRequestEvent('http://localhost:3000/test');

    const result = requestEv.rewrite('http://localhost:3000/x?q=1#h');

    expect(result).toBeInstanceOf(RewriteMessage);
    expect(result.pathname).toBe('/x');
    expect(result.search).toBe('?q=1');
  });

  it('leaves search undefined for a same-origin absolute URL without a query', () => {
    const requestEv = createMockRequestEvent('http://localhost:3000/test');

    const result = requestEv.rewrite('http://localhost:3000/x');

    expect(result.pathname).toBe('/x');
    expect(result.search).toBeUndefined();
  });

  it('throws a 400 ServerError for cross-origin absolute URLs', () => {
    const requestEv = createMockRequestEvent('http://localhost:3000/test');

    let thrown: unknown;
    try {
      requestEv.rewrite('http://other-origin.com/x');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ServerError);
    expect((thrown as InstanceType<typeof ServerError>).status).toBe(400);
    expect(requestEv.sharedMap.get(RequestEvIsRewrite)).toBeUndefined();
  });

  it('throws a 400 ServerError when the URL is invalid after the protocol', () => {
    const requestEv = createMockRequestEvent('http://localhost:3000/test');

    let thrown: unknown;
    try {
      requestEv.rewrite('http://');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ServerError);
    expect((thrown as InstanceType<typeof ServerError>).status).toBe(400);
  });

  it('does not treat a relative path starting with "http" as an absolute URL', () => {
    const requestEv = createMockRequestEvent('http://localhost:3000/test');

    const result = requestEv.rewrite('/http-docs/x');

    expect(result).toBeInstanceOf(RewriteMessage);
    expect(result.pathname).toBe('/http-docs/x');
    expect(result.search).toBeUndefined();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { RedirectMessage } from './redirect-handler';
import { createRequestEvent } from './request-event';
import type { ServerRequestEvent } from './types';

function createMockServerRequestEvent(url = 'http://localhost:3000/test'): ServerRequestEvent {
  const mockRequest = new Request(url);

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

function createMockRequestEvent(url = 'http://localhost:3000/test') {
  const serverRequestEv = createMockServerRequestEvent(url);
  return createRequestEvent(serverRequestEv, null, [], '/', vi.fn());
}

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

  it('should throw error when trying to redirect after headers are sent', () => {
    const requestEv = createMockRequestEvent();

    // Trigger getWritableStream to simulate headers being sent
    requestEv.getWritableStream();

    expect(() => {
      requestEv.redirect(302, '/should-fail');
    }).toThrow('Response already sent');
  });
});

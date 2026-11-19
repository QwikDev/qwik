import { describe, expect, it, vi } from 'vitest';
import type { LoadedRoute } from '../../runtime/src/types';
import { createRequestEvent, RequestRouteName } from './request-event-core';
import { getQwikRouterServerData, getServerDataUrl } from './response-page';
import type { ServerRequestEvent } from './types';

describe('getServerDataUrl', () => {
  const originalUrl = new URL('http://localhost:3000/path/?q=1');
  const forwardedHeaders = new Headers({
    'X-Forwarded-Host': 'example.com',
    'X-Forwarded-Proto': 'https',
  });

  it('ignores forwarded headers by default', () => {
    expect(getServerDataUrl(originalUrl, forwardedHeaders, false)).toBe(
      'http://localhost:3000/path/?q=1'
    );
  });

  it('uses forwarded headers when trusted', () => {
    expect(getServerDataUrl(originalUrl, forwardedHeaders, true)).toBe(
      'https://example.com/path/?q=1'
    );
  });

  it('keeps the forwarded port when trusted', () => {
    const headers = new Headers({ 'X-Forwarded-Host': 'example.com:9999' });
    expect(getServerDataUrl(originalUrl, headers, true)).toBe('http://example.com:9999/path/?q=1');
  });

  it('keeps the original url without forwarded headers', () => {
    expect(getServerDataUrl(originalUrl, new Headers(), true)).toBe(
      'http://localhost:3000/path/?q=1'
    );
  });
});

const serverDataFor = (routeName: string, layoutKeys?: string[]) => {
  const url = 'http://localhost:3000/test';
  const serverRequestEv = {
    mode: 'server',
    url: new URL(url),
    locale: undefined,
    platform: {},
    request: new Request(url),
    env: { get: vi.fn() },
    getClientConn: vi.fn(() => ({ ip: '127.0.0.1' })),
    getWritableStream: vi.fn(),
  } as unknown as ServerRequestEvent;
  const route: LoadedRoute = {
    $routeName$: routeName,
    $params$: {},
    $mods$: [],
    $layoutKeys$: layoutKeys,
  };
  const requestEv = createRequestEvent(serverRequestEv, route, [], '/', vi.fn());
  requestEv.sharedMap.set(RequestRouteName, routeName);
  return getQwikRouterServerData(requestEv, false);
};

describe('getQwikRouterServerData', () => {
  it('names the route as a preload seed, in the form the bundle graph uses', () => {
    expect(serverDataFor('/modal/').preloadSeeds).toEqual(['modal/']);
  });

  it('names the route pattern, not the URL, for a dynamic route', () => {
    expect(serverDataFor('/blog/[slug]').preloadSeeds).toEqual(['blog/[slug]/']);
  });

  it('names the home route as a single slash', () => {
    expect(serverDataFor('/').preloadSeeds).toEqual(['/']);
  });

  it("names the route's layouts before the route, outermost first", () => {
    expect(serverDataFor('/docs/intro/', ['Layout', 'DocsLayout']).preloadSeeds).toEqual([
      'Layout',
      'DocsLayout',
      'docs/intro/',
    ]);
  });
});

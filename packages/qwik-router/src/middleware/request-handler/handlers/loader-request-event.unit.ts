import { describe, expect, it, vi } from 'vitest';
import { getRouteLoaderCtx, loadRouteLoader } from '../../../runtime/src/route-loaders';
import type { LoaderInternal } from '../../../runtime/src/types';
import type { RequestEventInternal } from '../request-event-core';
import { createLoaderRequestEventFactory } from './loader-request-event';

describe('createLoaderRequestEventFactory', () => {
  it('scopes filtered URL state per loader while delegating request state', () => {
    const requestEv = createRequestEv();
    const getLoaderRequestEvent = createLoaderRequestEventFactory(requestEv);
    const pageLoader = createLoader('page-loader', ['page']);
    const queryLoader = createLoader('query-loader', ['q']);

    const pageEv = getLoaderRequestEvent(pageLoader);
    const queryEv = getLoaderRequestEvent(queryLoader);

    expect(pageEv.url.search).toBe('?page=2');
    expect(pageEv.query.get('page')).toBe('2');
    expect(pageEv.query.has('q')).toBe(false);
    expect(pageEv.request.url).toBe('http://localhost/products/?page=2');
    expect(pageEv.originalUrl.href).toBe('http://localhost/products/?page=2');
    expect(pageEv.params).toEqual({});

    expect(queryEv.url.search).toBe('?q=shoes');
    expect(queryEv.query.get('q')).toBe('shoes');
    expect(queryEv.query.has('page')).toBe(false);
    expect(queryEv.request.url).toBe('http://localhost/products/?q=shoes');
    expect(queryEv.originalUrl.href).toBe('http://localhost/products/?q=shoes');
    expect(queryEv.params).toEqual({});

    pageEv.sharedMap.set('shared', 'value');
    expect(requestEv.sharedMap.get('shared')).toBe('value');
  });

  it('creates a request event without search when the filtered search is empty', () => {
    const requestEv = createRequestEv();
    const getLoaderRequestEvent = createLoaderRequestEventFactory(requestEv);
    const missingLoader = createLoader('missing-loader', ['missing']);
    const missingEv = getLoaderRequestEvent(missingLoader);

    expect(missingEv).not.toBe(requestEv);
    expect(missingEv.url.search).toBe('');
    expect(missingEv.query.toString()).toBe('');
    expect(missingEv.request.url).toBe('http://localhost/products/');
    expect(missingEv.originalUrl.href).toBe('http://localhost/products/');
  });

  it('returns the original request event when there is no loader search filter', () => {
    const requestEv = createRequestEv();
    const getLoaderRequestEvent = createLoaderRequestEventFactory(requestEv);
    const unfilteredLoader = createLoader('unfiltered-loader', undefined);

    expect(getLoaderRequestEvent(unfilteredLoader)).toBe(requestEv);
  });

  it('returns the original request event for empty filtered search when the URL has no search', () => {
    const requestEv = createRequestEv('http://localhost/products/');
    const getLoaderRequestEvent = createLoaderRequestEventFactory(requestEv);
    const missingLoader = createLoader('missing-loader', ['missing']);

    expect(getLoaderRequestEvent(missingLoader)).toBe(requestEv);
  });

  it('returns the original request event when the filtered search exactly matches the URL search', () => {
    const requestEv = createRequestEv('http://localhost/products/?page=2&q=shoes');
    const getLoaderRequestEvent = createLoaderRequestEventFactory(requestEv);
    const matchingLoader = createLoader('matching-loader', ['page', 'q']);

    expect(getLoaderRequestEvent(matchingLoader)).toBe(requestEv);
  });

  it('creates a request event when the filtered search has different query order', () => {
    const requestEv = createRequestEv('http://localhost/products/?q=shoes&page=2');
    const getLoaderRequestEvent = createLoaderRequestEventFactory(requestEv);
    const reorderedLoader = createLoader('reordered-loader', ['page', 'q']);
    const reorderedEv = getLoaderRequestEvent(reorderedLoader);

    expect(reorderedEv).not.toBe(requestEv);
    expect(reorderedEv.url.search).toBe('?page=2&q=shoes');
  });

  it('reuses request event views by filtered search', () => {
    const requestEv = createRequestEv();
    const getLoaderRequestEvent = createLoaderRequestEventFactory(requestEv);
    const pageLoader = createLoader('page-loader', ['page']);
    const samePageLoader = createLoader('same-page-loader', ['page']);

    expect(getLoaderRequestEvent(pageLoader)).toBe(getLoaderRequestEvent(samePageLoader));
  });

  it('scopes strict loader events by loader pathname and filtered search', () => {
    const previousStrictLoaders = globalThis.__STRICT_LOADERS__;
    globalThis.__STRICT_LOADERS__ = true;
    try {
      const requestEv = createRequestEv('http://localhost/products/123/view/?page=2&q=shoes');
      const routeLoaderCtx = getRouteLoaderCtx(requestEv);
      routeLoaderCtx.loaderPaths['products-loader'] = '/products/';
      routeLoaderCtx.loaderPaths['details-loader'] = '/products/123/';
      const getLoaderRequestEvent = createLoaderRequestEventFactory(requestEv);
      const productsLoader = createLoader('products-loader', ['page']);
      const detailsLoader = createLoader('details-loader', ['page']);

      const productsEv = getLoaderRequestEvent(productsLoader);
      const detailsEv = getLoaderRequestEvent(detailsLoader);

      expect(productsEv).not.toBe(detailsEv);
      expect(productsEv.pathname).toBe('/products/');
      expect(productsEv.url.href).toBe('http://localhost/products/?page=2');
      expect(detailsEv.pathname).toBe('/products/123/');
      expect(detailsEv.url.href).toBe('http://localhost/products/123/?page=2');
      expect(productsEv.request.url).toBe('http://localhost/products/?page=2');
      expect(productsEv.originalUrl.href).toBe('http://localhost/products/?page=2');
      expect(productsEv.params).toEqual({});
    } finally {
      globalThis.__STRICT_LOADERS__ = previousStrictLoaders;
    }
  });

  it('resolves nested loader values with the target loader filtered URL', async () => {
    const requestEv = createRequestEv();
    const getLoaderRequestEvent = createLoaderRequestEventFactory(requestEv);
    const childLoader = createLoader('child-loader', ['q'], async (_thisArg, ev) => {
      return ev.url.search;
    });
    const parentLoader = createLoader('parent-loader', ['page'], async (_thisArg, ev) => {
      return ev.resolveValue(childLoader);
    });

    await expect(loadRouteLoader(parentLoader, getLoaderRequestEvent(parentLoader))).resolves.toBe(
      '?q=shoes'
    );
    expect(childLoader.__qrl.call).toHaveBeenCalledOnce();
  });
});

function createRequestEv(
  href = 'http://localhost/products/?q=shoes&page=2&ignored=true'
): RequestEventInternal {
  const url = new URL(href);
  const requestEv = {
    cookie: {},
    headers: new Headers(),
    request: new Request(url),
    url,
    sharedMap: new Map<string, unknown>(),
  } as any;
  requestEv.resolveValue = (loader: LoaderInternal) => loadRouteLoader(loader, requestEv);
  return requestEv;
}

function createLoader(
  id: string,
  search: string[] | undefined,
  fn: (thisArg: unknown, ev: any) => unknown = async () => undefined
): LoaderInternal {
  return {
    __brand: 'server_loader',
    __id: id,
    __qrl: {
      call: vi.fn(fn),
      getHash: () => id,
      getSymbol: () => id,
    },
    __validators: undefined,
    __serializationStrategy: 'never',
    __expires: 0,
    __poll: false,
    __eTag: undefined,
    __cacheKey: undefined,
    __search: search,
    __allowStale: true,
  } as any;
}

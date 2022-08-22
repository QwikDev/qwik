import { bundleImports, mapping } from '@qwik-client-manifest';
import type { ServiceWorkerEventMessage, ServiceWorkerOptions } from './types';

const qBase = '/build/';

const qBuildCacheName = 'QwikBuild';

const cachedSymbolFetch = async (
  opts: NormalizedServiceWorkerOptions,
  cache: Cache,
  fetch: Fetch,
  request: Request
) => {
  const cachedRes = await cache.match(request.url);
  if (cachedRes) {
    return cachedRes;
  }

  const networkRes = await fetch(request.url);
  if (networkRes.ok) {
    cache.put(request.url, networkRes.clone());
  }

  return networkRes;
};

const fetchSymbols = async (
  opts: NormalizedServiceWorkerOptions,
  cache: Cache,
  fetch: Fetch,
  symbols: string[],
  qBundleUrls: Set<string>,
  qBaseUrl: URL
) => {
  const urls = new Set<string>();
  const fetches: Promise<Response>[] = [];

  const fetchSymbolBundle = (bundleName: string) => {
    const url = new URL(qBase + bundleName, qBaseUrl).href;
    if (!urls.has(url)) {
      urls.add(url);
      const request = new Request(url);
      fetches.push(cachedSymbolFetch(opts, cache, fetch, request));
    }
  };

  symbols.forEach((symbol) => {
    const bundleName = mapping[symbol];
    if (bundleName) {
      fetchSymbolBundle(bundleName);
      const importedBundleNames = bundleImports[bundleName];
      if (importedBundleNames) {
        importedBundleNames.forEach(fetchSymbolBundle);
      }
    }
  });

  await Promise.all(fetches);

  const cachedRequests = await cache.keys();
  if (cachedRequests.length > qBundleUrls.size) {
    const deleteRequests = cachedRequests
      .filter((r) => !qBundleUrls.has(r.url))
      .map((r) => cache.delete(r));
    await Promise.all(deleteRequests);
  }
};

const setupServiceWorkerSelf = (
  self: ServiceWorkerGlobalScope,
  opts: NormalizedServiceWorkerOptions
) => {
  const nativeFetch = self.fetch.bind(self);
  const qBaseUrl = new URL(qBase, self.origin);
  const qBundleUrls = new Set(
    Object.keys(bundleImports).map((bundleName) => new URL(bundleName, qBaseUrl).href)
  );

  self.addEventListener('fetch', (ev) => {
    const request = ev.request;

    if (request.method === 'GET') {
      if (opts.symbolPrefetch !== 'none' && qBundleUrls.has(request.url)) {
        ev.respondWith(
          self.caches
            .open(qBuildCacheName)
            .then((cache) => cachedSymbolFetch(opts, cache, nativeFetch, request))
        );
      }
    }
  });

  self.addEventListener('message', async ({ data }: ServiceWorkerEventMessage) => {
    if (Array.isArray(data.qprefetchsymbols)) {
      const cache = await self.caches.open(qBuildCacheName);
      await fetchSymbols(opts, cache, nativeFetch, data.qprefetchsymbols, qBundleUrls, qBaseUrl);
    }
  });

  if (opts.symbolPrefetch === 'all') {
    self.addEventListener('install', async () => {
      const cache = await self.caches.open(qBuildCacheName);
      const symbols = Object.keys(mapping);
      await fetchSymbols(opts, cache, nativeFetch, symbols, qBundleUrls, qBaseUrl);
    });
  }
};

const normalizeSwOptions = (
  opts: ServiceWorkerOptions | undefined
): NormalizedServiceWorkerOptions => {
  return {
    symbolPrefetch: 'auto',
    ...opts,
  };
};

export const setupServiceWorker = (opts?: ServiceWorkerOptions) =>
  setupServiceWorkerSelf(self as any, normalizeSwOptions(opts));

type NormalizedServiceWorkerOptions = Required<ServiceWorkerOptions>;

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

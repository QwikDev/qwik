import { isDev } from '@qwik.dev/core';
import { _serialize } from '@qwik.dev/core/internal';
import {
  FULLPATH_HEADER,
  getRouteLoaderCtx,
  getRouteLoaderResponse,
  resolveRouteLoaderByHash,
  setRouteLoaders,
} from '../../../runtime/src/route-loaders';
import type { LoaderInternal, RequestEvent, RequestHandler } from '../../../runtime/src/types';
import { defaultLoaderCacheKey, getCachedLoader, resolveCacheKey, setCachedLoader } from '../etag';
import { performETagMatch, hash, normalizeETag, setETagHeader } from '../etag-hash';
import type { RequestEventInternal } from '../request-event-core';
import { IsQLoader, QLoaderId } from '../request-path';
import { createLoaderRequestEventFactory } from './loader-request-event';

/**
 * Handler that executes the requested loader and returns the result as JSON. Runs AFTER
 * plugin/route middleware, so middleware redirects/errors are handled by `jsonRequestWrapper`. The
 * loader function's own redirects/errors are caught by getRouteLoaderResponse and serialized in the
 * LoaderResponse envelope ({ d, r, e }).
 */
export function loaderHandler(
  routeLoaders: LoaderInternal[],
  loaderPaths?: Record<string, string>
): RequestHandler {
  return async (requestEvent: RequestEvent) => {
    const requestEv = requestEvent as RequestEventInternal;

    if (!requestEv.sharedMap.has(IsQLoader)) {
      return;
    }

    if (requestEv.headersSent || requestEv.exited) {
      return;
    }

    const loaderId = requestEv.sharedMap.get(QLoaderId) as string;
    const loader = resolveRouteLoaderByHash(routeLoaders, loaderId);

    if (!loader) {
      requestEv.json(404, { error: 'Loader not found' });
      return;
    }

    const activeRouteLoaders =
      isDev && !routeLoaders.includes(loader) ? [...routeLoaders, loader] : routeLoaders;
    setLoaderData(requestEv, activeRouteLoaders, loaderPaths);

    const loaderRequestEv = createLoaderRequestEventFactory(requestEv)(loader);

    // Pre-loader eTag: when an explicit string/function eTag is configured, set the ETag header and
    // short-circuit with 304 if If-None-Match already matches — saves running the loader.
    const normalizedETag =
      loader.__eTag !== undefined ? resolvePreETag(loader.__eTag, loaderRequestEv) : '';
    if (normalizedETag && performETagMatch(loaderRequestEv, normalizedETag)) {
      return;
    }

    let cacheKey = '';
    if (loader.__cacheKey) {
      // Resolve cache key (if cacheKey is configured). The eTag slot is filled with the explicit
      // eTag when set; an auto-computed eTag from the response body never participates in the key
      // (cache lookup runs before the loader, so the body isn't available yet).
      cacheKey = resolveCacheKey(
        loader.__cacheKey,
        defaultLoaderCacheKey,
        loaderRequestEv,
        normalizedETag
      );
    }

    // We don't count falsy cacheKeys as valid
    if (cacheKey) {
      const cached = getCachedLoader(cacheKey);
      if (cached) {
        // On hit, surface the cached eTag (auto-hashed from the original body) so a conditional
        // request can 304. The explicit-eTag path already 304'd above if applicable.
        if (!normalizedETag) {
          if (performETagMatch(loaderRequestEv, cached.eTag)) {
            return;
          }
        } else {
          setETagHeader(loaderRequestEv, cached.eTag);
        }
        await sendLoaderResponse(requestEv, cached.body, loader);
        return;
      }
    }

    const responseData = await getRouteLoaderResponse(
      loader.__qrl,
      loader.__validators,
      loaderRequestEv
    );
    const data = await _serialize(responseData);

    // Only successful data envelopes are cacheable; never cache redirects, errors, or fail() results.
    const failed =
      responseData.d && typeof responseData.d === 'object' && (responseData.d as any).failed;
    const cacheable = cacheKey && !responseData.r && !responseData.e && !failed;

    // When caching is enabled but there's no eTag, auto-hash.
    const finalETag = normalizedETag || (cacheable ? hash(data) : '');

    if (cacheable && finalETag) {
      // Cache write happens before the optional 304 below so the cache is warmed even on a first
      // conditional request that happens to match the auto-hashed eTag.
      setCachedLoader(cacheKey, { eTag: finalETag, body: data });
    }

    // If we auto-hashed, check if the request matches
    if (!normalizedETag && finalETag && performETagMatch(loaderRequestEv, finalETag)) {
      return;
    }

    await sendLoaderResponse(requestEv, data, loader);
  };
}

function setLoaderData(
  requestEv: RequestEventInternal,
  routeLoaders: LoaderInternal[],
  loaderPaths: Record<string, string> | undefined
) {
  if (loaderPaths) {
    Object.assign(getRouteLoaderCtx(requestEv).loaderPaths, loaderPaths);
  }
  setRouteLoaders(requestEv, routeLoaders);
}

/** Resolve eTag from a static string or function (before running the loader). */
function resolvePreETag(
  eTagOption: string | ((ev: RequestEvent) => string | null),
  requestEv: RequestEvent
): string {
  if (typeof eTagOption === 'string') {
    return normalizeETag(eTagOption);
  }
  const result = eTagOption(requestEv);
  return result ? normalizeETag(result) : '';
}

async function sendLoaderResponse(
  requestEv: RequestEventInternal,
  data: string,
  loader?: LoaderInternal
) {
  requestEv.headers.set('Content-Type', 'application/json; charset=utf-8');
  addVaryHeader(requestEv, FULLPATH_HEADER);
  if (loader?.__expires && loader.__expires > 0) {
    requestEv.cacheControl({ maxAge: Math.ceil(loader.__expires / 1000) });
  }
  requestEv.send(200, data);
}

export function addVaryHeader(requestEv: RequestEventInternal, value: string) {
  const vary = requestEv.headers.get('Vary');
  if (!vary) {
    requestEv.headers.set('Vary', value);
    return;
  }
  const existing = vary.split(',').map((item) => item.trim().toLowerCase());
  if (!existing.includes(value.toLowerCase())) {
    requestEv.headers.set('Vary', `${vary}, ${value}`);
  }
}

/** Serialize and send a JSON response (used by error/redirect paths in jsonRequestWrapper). */
export async function sendJsonResponse(
  requestEv: RequestEventInternal,
  responseData: Record<string, unknown>,
  status: number = 200
) {
  const data = await _serialize(responseData);
  requestEv.headers.set('Content-Type', 'application/json; charset=utf-8');
  requestEv.send(status, data);
}

export async function sendActionResponse(
  requestEv: RequestEventInternal,
  responseData: Record<string, unknown>
) {
  const data = await _serialize(responseData);
  requestEv.headers.set('Content-Type', 'application/json; charset=utf-8');
  requestEv.send((responseData.s as number) || 200, data);
}

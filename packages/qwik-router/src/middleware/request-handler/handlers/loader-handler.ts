import { _serialize } from '@qwik.dev/core/internal';
import {
  FULLPATH_HEADER,
  getRouteLoaderResponse,
  resolveRouteLoaderByHash,
} from '../../../runtime/src/route-loaders';
import type { LoaderInternal, RequestEvent, RequestHandler } from '../../../runtime/src/types';
import { type RequestEventInternal } from '../request-event-core';
import { IsQLoader, QLoaderId } from '../request-path';

/**
 * Handler that executes the requested loader and returns the result as JSON. Runs AFTER
 * plugin/route middleware, so middleware redirects/errors are handled by `jsonRequestWrapper`. The
 * loader function's own redirects/errors are caught by getRouteLoaderResponse and serialized in the
 * LoaderResponse envelope ({ d, r, e }).
 */
export function loaderHandler(routeLoaders: LoaderInternal[]): RequestHandler {
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

    // ETag support: for string/function eTags, check If-None-Match BEFORE running the loader
    if (loader.__eTag && loader.__eTag !== true) {
      const eTag = resolvePreETag(loader.__eTag, requestEv);
      if (eTag && checkETagMatch(requestEv, eTag)) {
        return;
      }
    }

    const responseData = await getRouteLoaderResponse(loader.__qrl, loader.__validators, requestEv);
    const data = await _serialize(responseData);

    // For eTag: true, compute eTag from serialized data AFTER running the loader
    if (loader.__eTag === true && responseData.d !== undefined) {
      const eTag = `"${fnv1aHash(data)}"`;
      if (checkETagMatch(requestEv, eTag)) {
        return;
      }
    }

    await sendLoaderResponse(requestEv, data, loader);
  };
}

/** Resolve eTag from a static string or function (before running the loader). */
function resolvePreETag(
  eTagOption: string | ((ev: RequestEvent) => string | null),
  requestEv: RequestEvent
): string | null {
  if (typeof eTagOption === 'string') {
    return `"${eTagOption}"`;
  }
  const result = eTagOption(requestEv);
  return result ? `"${result}"` : null;
}

/** Set the ETag header and check If-None-Match. Returns true if 304 was sent. */
function checkETagMatch(requestEv: RequestEventInternal, eTag: string): boolean {
  requestEv.headers.set('ETag', eTag);
  const ifNoneMatch = requestEv.request.headers.get('If-None-Match');
  if (
    ifNoneMatch &&
    (ifNoneMatch === eTag || ifNoneMatch === `W/${eTag}` || `W/${ifNoneMatch}` === eTag)
  ) {
    requestEv.send(304 as any, '' as any);
    return true;
  }
  return false;
}

/** FNV-1a hash for generating eTags from serialized data. */
function fnv1aHash(str: string): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) | 0; // FNV prime, keep 32-bit
  }
  return (hash >>> 0).toString(36);
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

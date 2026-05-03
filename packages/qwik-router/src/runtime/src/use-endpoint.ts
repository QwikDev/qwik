import type { RouteActionValue } from './types';
import { _deserialize } from '@qwik.dev/core/internal';
import { ensureSlash } from '../../utils/pathname';
import { QACTION_KEY } from './constants';

/**
 * Submit an action to the server and get the result.
 *
 * POSTs to `/routePath/?qaction={actionId}` with `Accept: application/json`. The server runs the
 * action and returns the action result together with the loader hashes that should be invalidated.
 */
export async function submitAction(
  action: NonNullable<RouteActionValue>,
  routePath: string
): Promise<
  | {
      status: number;
      result: unknown;
      redirect?: string;
      loaderHashes?: string[];
      loaderValues?: Record<string, unknown>;
    }
  | undefined
> {
  const pathBase = ensureSlash(routePath);
  const url = `${pathBase}?${QACTION_KEY}=${encodeURIComponent(action.id)}`;

  const actionData = action.data;
  let fetchOptions: RequestInit;

  if (actionData instanceof FormData) {
    fetchOptions = {
      method: 'POST',
      body: actionData,
      headers: {
        Accept: 'application/json',
      },
    };
  } else {
    fetchOptions = {
      method: 'POST',
      body: JSON.stringify(actionData),
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Accept: 'application/json',
      },
    };
  }

  const response = await fetch(url, fetchOptions);

  if (response.redirected) {
    const redirectedURL = new URL(response.url);
    if (redirectedURL.origin !== location.origin) {
      location.href = redirectedURL.href;
      return undefined;
    }
    location.href = redirectedURL.href;
    return undefined;
  }

  if ((response.headers.get('content-type') || '').includes('json')) {
    const text = await response.text();
    const data = _deserialize<{
      result: unknown;
      redirect?: string;
      loaderHashes?: string[];
      loaders?: Record<string, unknown>;
    }>(text);
    return {
      status: response.status,
      result: data?.result,
      redirect: data?.redirect,
      loaderHashes: data?.loaderHashes,
      loaderValues: data?.loaders,
    };
  }

  return undefined;
}

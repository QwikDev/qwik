import type { RouteActionValue } from './types';
import type { ServerError } from '../../middleware/request-handler/server-error';
import { _deserialize } from '@qwik.dev/core/internal';
import { ensureSlash } from '../../utils/pathname';
import { QACTION_KEY } from './constants';

/**
 * Submit an action to the server and get the result.
 *
 * POSTs to `/routePath/?qaction={actionId}` with `Accept: application/json`. The server runs the
 * action and returns the action result, optionally with the loader hashes that should be
 * invalidated.
 */
export async function submitAction(
  action: NonNullable<RouteActionValue>,
  routePath: string
): Promise<
  | {
      status: number;
      result?: unknown;
      error?: ServerError;
      /** Set when the submission aborted (thrown error() or unexpected server error). */
      aborted?: ServerError;
      redirect?: string;
      loaderHashes?: string[];
    }
  | undefined
> {
  const pathBase = ensureSlash(routePath);
  const url = `${pathBase}?${QACTION_KEY}=${encodeURIComponent(action.id)}`;

  const actionData = action.data;
  // Clear immediately so a task rerun can't re-submit the same payload
  action.data = undefined;
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
      result?: unknown;
      error?: ServerError;
      aborted?: ServerError;
      redirect?: string;
      loaderHashes?: string[];
    }>(text);
    return {
      status: response.status,
      result: data?.result,
      error: data?.error,
      aborted: data?.aborted,
      redirect: data?.redirect,
      loaderHashes: data?.loaderHashes,
    };
  }

  return undefined;
}

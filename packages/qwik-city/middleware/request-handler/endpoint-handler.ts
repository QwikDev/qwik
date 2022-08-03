import { errorHandler, methodNotAllowedHandler } from './error-handler';
import { HttpStatus } from './http-status-codes';
import type { QwikCityRequestContext, UserResponseContext } from './types';

export function endpointHandler<T = any>(
  requestCtx: QwikCityRequestContext,
  userResponse: UserResponseContext
): Promise<T> {
  const { pendingBody, resolvedBody, status, headers } = userResponse;
  const { response } = requestCtx;

  if (status === HttpStatus.InternalServerError) {
    // redirect
    return errorHandler(requestCtx, resolvedBody);
  }

  if (status === HttpStatus.MethodNotAllowed) {
    // no handler for this request method
    return methodNotAllowedHandler(requestCtx);
  }

  if (status >= HttpStatus.MovedPermanently && status <= HttpStatus.PermanentRedirect) {
    // redirect
    return response(status, headers, asyncNoop);
  }

  if (pendingBody === undefined && resolvedBody === undefined) {
    // undefined body
    return response(status, headers, asyncNoop);
  }

  if (!headers.has('Content-Type')) {
    // default to have json content-type if it wasn't set
    headers.set('Content-Type', 'application/json; charset=utf-8');
  }

  // check so we can know later on if we should stringify the data
  const isJson = headers.get('Content-Type')!.includes('application/json');

  return response(status, headers, async ({ write }) => {
    const body = pendingBody !== undefined ? await pendingBody : resolvedBody;
    if (body !== undefined) {
      if (isJson) {
        write(JSON.stringify(body));
      } else {
        write(body);
      }
    }
  });
}

const asyncNoop = async () => {};

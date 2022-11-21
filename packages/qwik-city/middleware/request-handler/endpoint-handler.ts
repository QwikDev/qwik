import type { QwikCityRequestContext, UserResponseContext } from './types';

export function endpointHandler<T = any>(
  requestCtx: QwikCityRequestContext,
  userResponse: UserResponseContext
): Promise<T> {
  const { pendingBody, resolvedBody, status, headers, cookie } = userResponse;
  const { response } = requestCtx;

  if (pendingBody === undefined && resolvedBody === undefined) {
    // undefined body
    return response(status, headers, cookie, asyncNoop);
  }

  if (!headers.has('Content-Type')) {
    // default to have json content-type if it wasn't set
    headers.set('Content-Type', 'application/json; charset=utf-8');
  }

  // check so we can know later on if we should JSON.stringify the body
  const isJson = headers.get('Content-Type')!.includes('json');

  return response(status, headers, cookie, async ({ write }) => {
    const body = pendingBody !== undefined ? await pendingBody : resolvedBody;
    if (body !== undefined) {
      if (isJson) {
        // we have body data and the response content type was set to json
        write(JSON.stringify(body));
      } else {
        // not a json response content type
        const type = typeof body;
        if (type === 'string') {
          // string body
          write(body as any);
        } else if (type === 'number' || type === 'boolean') {
          // convert to string body
          write(String(body));
        } else {
          // unknown content type, do not assume how to serialize
          write(body as any);
        }
      }
    }
  });
}

const asyncNoop = async () => {};

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

  return response(status, headers, cookie, async ({ write }) => {
    const body = pendingBody !== undefined ? await pendingBody : resolvedBody;
    if (body !== undefined) {
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
  });
}

const asyncNoop = async () => {};

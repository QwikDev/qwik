import type { QwikCityRequestContext, UserResponseContext } from './types';

export function endpointHandler<T = any>(
  requestCtx: QwikCityRequestContext,
  userResponse: UserResponseContext
): Promise<T> {
  const { resolvedBody, status, headers, cookie } = userResponse;
  const { response } = requestCtx;

  if (resolvedBody === undefined) {
    // undefined body
    return response(status, headers, cookie, asyncNoop);
  }

  return response(status, headers, cookie, async ({ write }) => {
    if (resolvedBody !== undefined) {
      const type = typeof resolvedBody;
      if (type === 'string') {
        // string body
        write(resolvedBody as any);
      } else if (type === 'number' || type === 'boolean') {
        // convert to string body
        write(String(resolvedBody));
      } else {
        // unknown content type, do not assume how to serialize
        write(resolvedBody as any);
      }
    }
  });
}

const asyncNoop = async () => {};

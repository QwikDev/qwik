import type { ServerRequestEvent, UserResponseContext } from './types';

export function responseEndpoint<T = unknown>(
  serverRequestEv: ServerRequestEvent,
  userResponseCtx: UserResponseContext
): T {
  return serverRequestEv.response(
    userResponseCtx.status,
    userResponseCtx.headers,
    userResponseCtx.cookie,
    (stream) => {
      userResponseCtx.stream = stream;
      while (userResponseCtx.writeQueue.length > 0) {
        stream.write(userResponseCtx.writeQueue.shift());
      }
      if (userResponseCtx.isEnded) {
        stream.end();
      }
    }
  );
}

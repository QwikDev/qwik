import { RequestEvent, ServerError } from '@qwik.dev/router/middleware/request-handler';
import { QFN_KEY } from '../../../runtime/src/constants';
import { getRequestMode } from '../request-event';
import type { ErrorCodes } from '../types';
import { encoder, measure, verifySerializable } from '../resolve-request-handlers';
import { _serialize, inlinedQrl } from '@qwik.dev/core/internal';

function isAsyncIterator(obj: unknown): obj is AsyncIterable<unknown> {
  return obj ? typeof obj === 'object' && Symbol.asyncIterator in obj : false;
}

export async function runServerFunction(ev: RequestEvent) {
  const serverFnHash = ev.query.get(QFN_KEY);
  if (
    serverFnHash &&
    ev.request.headers.get('X-QRL') === serverFnHash &&
    ev.request.headers.get('Content-Type') === 'application/qwik-json'
  ) {
    ev.exit();
    const isDev = getRequestMode(ev) === 'dev';
    const data = (await ev.parseBody()) as [args?: unknown[] | undefined, captured?: unknown[]];
    if (Array.isArray(data)) {
      // Semi-hack: Look up the server function by its hash
      // it will have been registered in the global map when the server function was created
      const qrl = inlinedQrl(null, serverFnHash, data[1]);
      let result: unknown;
      try {
        if (isDev) {
          result = await measure(ev, `server_${serverFnHash}`, () =>
            (qrl as Function).apply(ev, data[0])
          );
        } else {
          result = await (qrl as Function).apply(ev, data[0]);
        }
      } catch (err) {
        if (err instanceof ServerError) {
          throw ev.error(err.status as ErrorCodes, err.data);
        }
        console.error(`Server function ${serverFnHash} failed:`, err);
        throw ev.error(500, 'Invalid request');
      }
      if (isAsyncIterator(result)) {
        ev.headers.set('Content-Type', 'text/qwik-json-stream');
        const writable = ev.getWritableStream();
        const stream = writable.getWriter();
        for await (const item of result) {
          if (isDev) {
            verifySerializable(item, qrl);
          }
          const message = await _serialize([item]);
          if (ev.signal.aborted) {
            break;
          }
          await stream.write(encoder.encode(`${message}\n`));
        }
        stream.close();
      } else {
        verifySerializable(result, qrl);
        ev.headers.set('Content-Type', 'application/qwik-json');
        const message = await _serialize([result]);
        ev.send(200, message);
      }
      return;
    }
    throw ev.error(500, 'Invalid request');
  }
}

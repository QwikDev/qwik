import { RequestEvent, ServerError } from '@qwik.dev/router/middleware/request-handler';
import { QFN_KEY } from '../../../runtime/src/constants';
import { getRequestMode } from '../request-event';
import type { ErrorCodes } from '../types';
import { encoder, measure, verifySerializable } from '../resolve-request-handlers';
import type { QRL } from '@qwik.dev/core';
import { _serialize } from '@qwik.dev/core/internal';

function isAsyncIterator(obj: unknown): obj is AsyncIterable<unknown> {
  return obj ? typeof obj === 'object' && Symbol.asyncIterator in obj : false;
}

const isQrl = (value: any): value is QRL => {
  return typeof value === 'function' && typeof value.getSymbol === 'function';
};

export async function pureServerFunction(ev: RequestEvent) {
  const fn = ev.query.get(QFN_KEY);
  if (
    fn &&
    ev.request.headers.get('X-QRL') === fn &&
    ev.request.headers.get('Content-Type') === 'application/qwik-json'
  ) {
    ev.exit();
    const isDev = getRequestMode(ev) === 'dev';
    const data = await ev.parseBody();
    if (Array.isArray(data)) {
      const [qrl, ...args] = data;
      if (isQrl(qrl) && qrl.getHash() === fn) {
        let result: unknown;
        try {
          if (isDev) {
            result = await measure(ev, `server_${qrl.getSymbol()}`, () =>
              (qrl as Function).apply(ev, args)
            );
          } else {
            result = await (qrl as Function).apply(ev, args);
          }
        } catch (err) {
          if (err instanceof ServerError) {
            throw ev.error(err.status as ErrorCodes, err.data);
          }
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
    }
    throw ev.error(500, 'Invalid request');
  }
}

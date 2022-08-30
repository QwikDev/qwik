import type { Render } from '@builder.io/qwik/server';
import type {
  StaticGeneratorOptions,
  StaticRoute,
  StaticWorkerRenderResult,
  System,
} from './types';
import { requestHandler } from '../../middleware/request-handler';
import { createHeaders } from '../../middleware/request-handler/headers';
import type { QwikCityRequestContext } from '../../middleware/request-handler/types';
import type { RequestContext } from '../../runtime/src/library/types';

export async function workerThread(sys: System, render: Render) {
  const opts = sys.getOptions();
  const pendingPromises = new Set<Promise<any>>();

  sys.createWorkerProcess(async (msg) => {
    switch (msg.type) {
      case 'render': {
        return new Promise<StaticWorkerRenderResult>((resolve) => {
          workerRender(sys, render, opts, msg, pendingPromises, resolve);
        });
      }
      case 'close': {
        const promises = Array.from(pendingPromises);
        pendingPromises.clear();
        await Promise.all(promises);
        return { type: 'close' };
      }
    }
  });
}

async function workerRender(
  sys: System,
  render: Render,
  opts: StaticGeneratorOptions,
  staticRoute: StaticRoute,
  pendingPromises: Set<Promise<any>>,
  callback: (result: StaticWorkerRenderResult) => void
) {
  // pathname and origin already normalized at this point
  const url = new URL(staticRoute.pathname, opts.origin);

  const result: StaticWorkerRenderResult = {
    type: 'render',
    pathname: staticRoute.pathname,
    url: url.href,
    ok: false,
    error: null,
  };

  try {
    const pageFilePath = sys.getPageFilePath(staticRoute.pathname);
    const dataFilePath = sys.getDataFilePath(staticRoute.pathname);

    const headers = createHeaders();
    headers.set('Accept', 'text/html');

    const request: RequestContext = {
      formData: async () => new URLSearchParams(),
      headers,
      json: async () => {},
      method: 'GET',
      text: async () => '',
      url: url.href,
    };

    const requestCtx: QwikCityRequestContext<void> = {
      url,
      request,
      response: async (status, headers, body, err) => {
        if (err) {
          if (err.stack) {
            result.error = String(err.stack);
          } else if (err.message) {
            result.error = String(err.message);
          } else {
            result.error = String(err);
          }
        } else {
          result.ok =
            status >= 200 &&
            status <= 299 &&
            (headers.get('Content-Type') || '').includes('text/html');
        }

        // early callback with result, don't bother waiting on fs writes
        callback(result);

        if (result.ok) {
          await sys.ensureDir(pageFilePath);

          return new Promise((resolve) => {
            const pageWriter = sys.createWriteStream(pageFilePath);
            const dataWriter = sys.createWriteStream(dataFilePath);

            body({
              write: (chunk) => {
                // page html writer
                pageWriter.write(chunk);
              },
              clientData: (data) => {
                // page data writer
                dataWriter.write(JSON.stringify(data));
              },
            }).finally(() => {
              dataWriter.close();
              pageWriter.close(resolve);
            });
          });
        }
      },
    };

    const promise = requestHandler(
      requestCtx,
      render,
      {},
      {
        ...opts,
        ...staticRoute,
      }
    )
      .then((rsp) => {
        if (rsp == null) {
          callback(result);
        }
      })
      .catch((e) => {
        if (e) {
          if (e.stack) {
            result.error = String(e.stack);
          } else if (e.message) {
            result.error = String(e.message);
          } else {
            result.error = String(e);
          }
        } else {
          result.error = `Error`;
        }
        callback(result);
      })
      .finally(() => {
        pendingPromises.delete(promise);
      });

    pendingPromises.add(promise);
  } catch (e: any) {
    if (e) {
      if (e.stack) {
        result.error = String(e.stack);
      } else if (e.message) {
        result.error = String(e.message);
      } else {
        result.error = String(e);
      }
    } else {
      result.error = `Error`;
    }
    callback(result);
  }
}

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
    const requestHeaders = createHeaders();
    requestHeaders.set('Accept', 'text/html,application/json');
    requestHeaders.set('Host', url.host);
    requestHeaders.set('User-Agent', 'Qwik City SSG');

    const request: RequestContext = {
      formData: async () => new URLSearchParams(),
      headers: requestHeaders,
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
          const writeHtmlEnabled = opts.emitHtml !== false;
          const writeDataEnabled = opts.emitData !== false;

          const htmlFilePath = sys.getPageFilePath(staticRoute.pathname);
          const dataFilePath = sys.getDataFilePath(staticRoute.pathname);

          if (writeHtmlEnabled || writeDataEnabled) {
            await sys.ensureDir(htmlFilePath);
          }

          return new Promise((resolve) => {
            const htmlWriter = writeHtmlEnabled ? sys.createWriteStream(htmlFilePath) : null;
            const dataWriter = writeDataEnabled ? sys.createWriteStream(dataFilePath) : null;

            body({
              write: (chunk) => {
                // page html writer
                if (htmlWriter) {
                  htmlWriter.write(chunk);
                }
              },
              clientData: (data) => {
                // page data writer
                if (dataWriter) {
                  dataWriter.write(JSON.stringify(data));
                }
              },
            }).finally(() => {
              if (htmlWriter) {
                if (dataWriter) {
                  dataWriter.close();
                }
                htmlWriter.close(resolve);
              } else if (dataWriter) {
                dataWriter.close(resolve);
              } else {
                resolve();
              }
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

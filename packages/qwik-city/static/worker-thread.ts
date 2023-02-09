import type {
  StaticGenerateHandlerOptions,
  StaticRoute,
  StaticWorkerRenderResult,
  System,
} from './types';
import type { ServerRequestEvent } from '@builder.io/qwik-city/middleware/request-handler';
import { requestHandler } from '@builder.io/qwik-city/middleware/request-handler';
import { pathToFileURL } from 'node:url';
import { WritableStream } from 'node:stream/web';
import { _serializeData } from '@builder.io/qwik';

export async function workerThread(sys: System) {
  const ssgOpts = sys.getOptions();
  const pendingPromises = new Set<Promise<any>>();

  const opts: StaticGenerateHandlerOptions = {
    ...ssgOpts,
    render: (await import(pathToFileURL(ssgOpts.renderModulePath).href)).default,
    qwikCityPlan: (await import(pathToFileURL(ssgOpts.qwikCityPlanModulePath).href)).default,
  };

  sys.createWorkerProcess(async (msg) => {
    switch (msg.type) {
      case 'render': {
        return new Promise<StaticWorkerRenderResult>((resolve) => {
          workerRender(sys, opts, msg, pendingPromises, resolve);
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
  opts: StaticGenerateHandlerOptions,
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
    filePath: null,
  };

  const isHtmlPage = staticRoute.staticRouteModule === 'page';

  // write enabled if it's an html page and emitHtml is not false
  // or if it is and endpoint
  // get the file path for where the page or endpoint will be written to
  const routeFilePath =
    (isHtmlPage && opts.emitHtml !== false) || staticRoute.staticRouteModule === 'endpoint'
      ? sys.getRouteFilePath(staticRoute)
      : null;

  // write data enabled if it's an html page and emitData is not false
  // and there is a q-data.json file path
  // get the file path for where the q-data.json file will be written to
  // q-data.json file path is only needed for html pages and when enabled
  const qDataFilePath =
    isHtmlPage && opts.emitData !== false ? sys.getDataFilePath(staticRoute) : null;

  if (routeFilePath) {
    await sys.ensureDir(routeFilePath);
  } else if (qDataFilePath) {
    await sys.ensureDir(qDataFilePath);
  }

  try {
    const request = new Request(url);

    const requestCtx: ServerRequestEvent<void> = {
      mode: 'static',
      locale: undefined,
      url,
      request,
      env: {
        get(key) {
          return sys.getEnv(key);
        },
      },
      platform: sys.platform,
      getWritableStream: (status, headers, _, _r, requestEv) => {
        result.ok = status >= 200 && status <= 299;

        if (isHtmlPage && !(headers.get('Content-Type') || '').includes('text/html')) {
          // html page, but not correct content type
          result.ok = false;
        }

        if (!result.ok) {
          // not ok, don't write anything
          return noopWriter;
        }

        // create a write stream for the static file if enabled
        const staticWriter = routeFilePath ? sys.createWriteStream(routeFilePath) : null;
        if (staticWriter) {
          staticWriter.on('error', (e) => {
            console.error(e);
            result.error = {
              message: e.message,
              stack: e.stack,
            };
            staticWriter.end();
          });
        }

        const stream = new WritableStream<Uint8Array>({
          write(chunk) {
            if (staticWriter) {
              // write to the static file if enabled
              staticWriter.write(Buffer.from(chunk.buffer));
            }
          },
          async close() {
            if (qDataFilePath) {
              const qData = requestEv.sharedMap.get('qData');
              if (qData) {
                // write q-data.json file when enabled and qData is set
                const serialized = await _serializeData(qData);
                const dataWriter = sys.createWriteStream(qDataFilePath);
                dataWriter.on('error', (e) => {
                  console.error(e);
                  result.error = {
                    message: e.message,
                    stack: e.stack,
                  };
                  dataWriter.end();
                });
                dataWriter.write(serialized);
                dataWriter.end();
              }
            }

            if (staticWriter) {
              // close the static file if there is one
              return new Promise<void>((resolve) => {
                // set the static file path for the result
                result.filePath = routeFilePath;
                staticWriter.end(resolve);
              });
            }
          },
        });
        return stream;
      },
    };

    const promise = requestHandler(requestCtx, opts)
      .then((rsp) => {
        if (rsp != null) {
          return rsp.completion;
        }
      })
      .then((e) => {
        if (e !== undefined) {
          if (e instanceof Error) {
            result.error = {
              message: e.message,
              stack: e.stack,
            };
          } else {
            result.error = {
              message: String(e),
              stack: undefined,
            };
          }
        }
      })
      .finally(() => {
        pendingPromises.delete(promise);
        callback(result);
      });

    pendingPromises.add(promise);
  } catch (e: any) {
    if (e instanceof Error) {
      result.error = {
        message: e.message,
        stack: e.stack,
      };
    } else {
      result.error = {
        message: String(e),
        stack: undefined,
      };
    }
    callback(result);
  }
}

const noopWriter = /*#__PURE__*/ new WritableStream({
  write() {},
  close() {},
});

import type {
  StaticGenerateHandlerOptions,
  StaticRoute,
  StaticWorkerRenderResult,
  System,
} from './types';
import type { ClientPageData } from '../runtime/src/types';
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
    contentType: null,
  };

  try {
    let hasRouteWriter = false;
    let closeResolved: (v?: any) => void;
    const closePromise = new Promise((closePromiseResolve) => {
      closeResolved = closePromiseResolve;
    });

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
        result.ok = status >= 200 && status < 300;

        if (!result.ok) {
          // not ok, don't write anything
          return noopWriter;
        }

        const contentType = (headers.get('Content-Type') || '').toLowerCase();
        const isHtml = contentType.includes('text/html');
        const routeFilePath = sys.getRouteFilePath(url.pathname, isHtml);

        hasRouteWriter = isHtml ? opts.emitHtml !== false : true;
        const writeQDataEnabled = isHtml && opts.emitData !== false;

        // create a write stream for the static file if enabled
        const routeWriter = hasRouteWriter ? sys.createWriteStream(routeFilePath) : null;
        if (routeWriter) {
          routeWriter.on('error', (e) => {
            console.error(e);
            hasRouteWriter = false;
            result.error = {
              message: e.message,
              stack: e.stack,
            };
            routeWriter.end();
          });
        }

        const stream = new WritableStream<Uint8Array>({
          async start() {
            if (isHtml && (hasRouteWriter || writeQDataEnabled)) {
              // for html pages or q-data.json, ensure the containing directory is created
              await sys.ensureDir(routeFilePath);
            }
          },
          write(chunk) {
            if (routeWriter) {
              // write to the static file if enabled
              routeWriter.write(Buffer.from(chunk.buffer));
            }
          },
          async close() {
            const writePromises: Promise<any>[] = [];

            if (writeQDataEnabled) {
              const qData: ClientPageData = requestEv.sharedMap.get('qData');
              if (qData && !url.pathname.endsWith('/404.html')) {
                // write q-data.json file when enabled and qData is set
                const qDataFilePath = sys.getDataFilePath(url.pathname);
                const dataWriter = sys.createWriteStream(qDataFilePath);
                dataWriter.on('error', (e) => {
                  console.error(e);
                  result.error = {
                    message: e.message,
                    stack: e.stack,
                  };
                });

                const serialized = await _serializeData(qData);
                dataWriter.write(serialized);

                writePromises.push(
                  new Promise<void>((resolve) => {
                    // set the static file path for the result
                    result.filePath = routeFilePath;
                    dataWriter.end(resolve);
                  })
                );
              }
            }

            if (routeWriter) {
              // close the static file if there is one
              writePromises.push(
                new Promise<void>((resolve) => {
                  // set the static file path for the result
                  result.filePath = routeFilePath;
                  routeWriter.end(resolve);
                }).finally(closeResolved)
              );
            }

            if (writePromises.length > 0) {
              await Promise.all(writePromises);
            }
          },
        });
        return stream;
      },
    };

    const promise = requestHandler(requestCtx, opts)
      .then(async (rsp) => {
        if (rsp != null) {
          const r = await rsp.completion;
          if (hasRouteWriter) {
            await closePromise;
          }
          return r;
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

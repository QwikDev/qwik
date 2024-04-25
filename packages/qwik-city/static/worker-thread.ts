import type {
  StaticGenerateHandlerOptions,
  StaticRoute,
  StaticStreamWriter,
  StaticWorkerRenderResult,
  System,
} from './types';
import type { ClientPageData } from '../runtime/src/types';
import type { ServerRequestEvent } from '@builder.io/qwik-city/middleware/request-handler';
import { requestHandler } from '@builder.io/qwik-city/middleware/request-handler';
import { pathToFileURL } from 'node:url';
import { WritableStream } from 'node:stream/web';
import { _deserializeData, _serializeData, _verifySerializable } from '@builder.io/qwik';

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

export async function createSingleThreadWorker(sys: System) {
  const ssgOpts = sys.getOptions();
  const pendingPromises = new Set<Promise<any>>();

  const opts: StaticGenerateHandlerOptions = {
    ...ssgOpts,
    render: (await import(pathToFileURL(ssgOpts.renderModulePath).href)).default,
    qwikCityPlan: (await import(pathToFileURL(ssgOpts.qwikCityPlanModulePath).href)).default,
  };

  return (staticRoute: StaticRoute) => {
    return new Promise<StaticWorkerRenderResult>((resolve) => {
      workerRender(sys, opts, staticRoute, pendingPromises, resolve);
    });
  };
}

async function workerRender(
  sys: System,
  opts: StaticGenerateHandlerOptions,
  staticRoute: StaticRoute,
  pendingPromises: Set<Promise<any>>,
  callback: (result: StaticWorkerRenderResult) => void
) {
  const qwikSerializer = {
    _deserializeData,
    _serializeData,
    _verifySerializable,
  };
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
    resourceType: null,
  };

  try {
    let routeWriter: StaticStreamWriter | null = null;
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
      getClientConn: () => {
        return {};
      },
      getWritableStream: (status, headers, _, _r, requestEv) => {
        result.ok = status >= 200 && status < 300;

        if (!result.ok) {
          // not ok, don't write anything
          return noopWritableStream as any;
        }

        result.contentType = (headers.get('Content-Type') || '').toLowerCase();
        const isHtml = result.contentType.includes('text/html');
        const is404ErrorPage = url.pathname.endsWith('/404.html');
        const routeFilePath = sys.getRouteFilePath(url.pathname, isHtml);

        if (is404ErrorPage) {
          result.resourceType = '404';
        } else if (isHtml) {
          result.resourceType = 'page';
        }

        const hasRouteWriter = isHtml ? opts.emitHtml !== false : true;
        const writeQDataEnabled = isHtml && opts.emitData !== false;

        const stream = new WritableStream<Uint8Array>({
          async start() {
            try {
              if (hasRouteWriter || writeQDataEnabled) {
                // for html pages, endpoints or q-data.json
                // ensure the containing directory is created
                await sys.ensureDir(routeFilePath);
              }

              if (hasRouteWriter) {
                // create a write stream for the static file if enabled
                routeWriter = sys.createWriteStream(routeFilePath);
                routeWriter.on('error', (e) => {
                  console.error(e);
                  routeWriter = null;
                  result.error = {
                    message: e.message,
                    stack: e.stack,
                  };
                });
              }
            } catch (e: any) {
              routeWriter = null;
              result.error = {
                message: String(e),
                stack: e.stack || '',
              };
            }
          },
          write(chunk) {
            try {
              if (routeWriter) {
                // write to the static file if enabled
                routeWriter.write(Buffer.from(chunk.buffer));
              }
            } catch (e: any) {
              routeWriter = null;
              result.error = {
                message: String(e),
                stack: e.stack || '',
              };
            }
          },
          async close() {
            const writePromises: Promise<any>[] = [];

            try {
              if (writeQDataEnabled) {
                const qData: ClientPageData = requestEv.sharedMap.get('qData');
                if (qData && !is404ErrorPage) {
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

                  const serialized = await _serializeData(qData, true);
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
                    routeWriter!.end(resolve);
                  }).finally(closeResolved)
                );
              }

              if (writePromises.length > 0) {
                await Promise.all(writePromises);
              }
            } catch (e: any) {
              routeWriter = null;
              result.error = {
                message: String(e),
                stack: e.stack || '',
              };
            }
          },
        });
        return stream;
      },
    };

    const promise = requestHandler(requestCtx, opts, qwikSerializer)
      .then((rsp) => {
        if (rsp != null) {
          return rsp.completion.then((r) => {
            if (routeWriter) {
              return closePromise.then(() => r);
            }
            return r;
          });
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

const noopWriter: WritableStreamDefaultWriter<any> = {
  closed: Promise.resolve(undefined),
  ready: Promise.resolve(undefined),
  desiredSize: 0,
  async close() {},
  async abort() {},
  async write() {},
  releaseLock() {},
};

const noopWritableStream: WritableStream = {
  get locked() {
    return false;
  },
  set locked(_: boolean) {},
  async abort() {},
  async close() {},
  getWriter() {
    return noopWriter;
  },
};

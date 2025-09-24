import { _serialize } from '@qwik.dev/core/internal';
import type { ServerRequestEvent } from '@qwik.dev/router/middleware/request-handler';
import {
  RedirectMessage,
  RequestEvShareQData,
  requestHandler,
} from '@qwik.dev/router/middleware/request-handler';
import { WritableStream } from 'node:stream/web';
import { pathToFileURL } from 'node:url';
import type { ClientPageData } from '../runtime/src/types';
import type {
  SsgHandlerOptions,
  SsgRoute,
  SsgWorkerRenderResult,
  StaticStreamWriter,
  System,
} from './types';

export async function workerThread(sys: System) {
  // Special case: we allow importing qwik again in the same process, it's ok because we just needed the serializer
  // TODO: remove this once we have vite environment API and no longer need the serializer separately
  delete (globalThis as any).__qwik;
  const ssgOpts = sys.getOptions();
  const pendingPromises = new Set<Promise<any>>();

  const opts: SsgHandlerOptions = {
    ...ssgOpts,
    render: (await import(pathToFileURL(ssgOpts.renderModulePath).href)).default,
    qwikRouterConfig: (await import(pathToFileURL(ssgOpts.qwikRouterConfigModulePath).href))
      .default,
  };

  sys.createWorkerProcess(async (msg) => {
    switch (msg.type) {
      case 'render': {
        return new Promise<SsgWorkerRenderResult>((resolve) => {
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
  // Special case: we allow importing qwik again in the same process, it's ok because we just needed the serializer
  // TODO: remove this once we have vite environment API and no longer need the serializer separately
  delete (globalThis as any).__qwik;
  const ssgOpts = sys.getOptions();
  const pendingPromises = new Set<Promise<any>>();

  const opts: SsgHandlerOptions = {
    ...ssgOpts,
    render: (await import(pathToFileURL(ssgOpts.renderModulePath).href)).default,
    qwikRouterConfig: (await import(pathToFileURL(ssgOpts.qwikRouterConfigModulePath).href))
      .default,
  };

  return (staticRoute: SsgRoute) => {
    return new Promise<SsgWorkerRenderResult>((resolve) => {
      workerRender(sys, opts, staticRoute, pendingPromises, resolve);
    });
  };
}

async function workerRender(
  sys: System,
  opts: SsgHandlerOptions,
  staticRoute: SsgRoute,
  pendingPromises: Set<Promise<any>>,
  callback: (result: SsgWorkerRenderResult) => void
) {
  // pathname and origin already normalized at this point
  const url = new URL(staticRoute.pathname, opts.origin);

  const result: SsgWorkerRenderResult = {
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
              console.error('Error during stream start', staticRoute.pathname, e);
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
              console.error('Error during stream write', staticRoute.pathname, e);
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
                const qData: ClientPageData = requestEv.sharedMap.get(RequestEvShareQData);
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

                  const serialized = await _serialize([qData]);
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
              console.error('Error during stream close', staticRoute.pathname, e);
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

    const promise = requestHandler(requestCtx, opts)
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
      .then((e: any) => {
        if (e !== undefined) {
          if (e instanceof RedirectMessage) {
            // TODO We should render a html page for redirects too
            // that would require refactoring redirects
            return;
          }
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
          console.error('Error during request handling', staticRoute.pathname, e);
        }
      })
      .finally(() => {
        pendingPromises.delete(promise);
        callback(result);
      });

    pendingPromises.add(promise);
  } catch (e: any) {
    console.error('Error during render', staticRoute.pathname, e);
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

const noopWritableStream = {
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

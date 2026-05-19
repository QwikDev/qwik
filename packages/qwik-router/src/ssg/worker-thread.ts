import { parentPort } from 'node:worker_threads';
// Use the global WritableStream, not node:stream/web — in worker threads they can be
// different classes, causing instanceof checks in pipeTo/TransformStream to fail.
import type { ClientPageData } from '../runtime/src/types';
import type { ServerRequestEvent } from '../middleware/request-handler/types';
import type {
  SsgHandlerOptions,
  SsgRoute,
  SsgWorkerRenderResult,
  StaticStreamWriter,
  System,
  WorkerInputMessage,
  WorkerOutputMessage,
} from './types';
import { renderQwikMiddleware, resolveRequestHandlers } from './resolve-request-handlers-ssg';
import { runQwikRouter } from './user-response-ssg';
import { loadRoute } from './worker-imports/runtime';
import { RequestEvShareQData } from '@qwik-router-ssg-worker/middleware/request-handler/request-event-core';
import { getRouteMatchPathname } from '@qwik-router-ssg-worker/middleware/request-handler/request-path';

interface StaticWorkerThreadDeps {
  RequestEvShareQData: string;
  loadRoute: typeof loadRoute;
  renderQwikMiddleware: typeof renderQwikMiddleware;
  resolveRequestHandlers: typeof resolveRequestHandlers;
  getRouteMatchPathname: typeof getRouteMatchPathname;
  runQwikRouter: typeof runQwikRouter;
}

interface WorkerThreadDeps extends StaticWorkerThreadDeps {
  serialize: typeof import('@qwik.dev/core/internal')._serialize;
}

const staticWorkerThreadDeps: StaticWorkerThreadDeps = {
  RequestEvShareQData,
  loadRoute,
  renderQwikMiddleware,
  resolveRequestHandlers,
  getRouteMatchPathname,
  runQwikRouter,
};

export async function workerThread(sys: System) {
  // Special case: we allow importing qwik again in the same process, it's ok because we just needed the serializer
  // TODO: remove this once we have vite environment API and no longer need the serializer separately
  delete (globalThis as any).__qwik;
  const opts = sys.getOptions();
  const pendingPromises = new Set<Promise<any>>();
  const deps: WorkerThreadDeps = {
    ...staticWorkerThreadDeps,
    serialize: await loadSerialize(),
  };

  // Prevent unhandled errors/rejections from crashing the worker thread.
  // SSR rendering can throw asynchronously (e.g., qwik's logErrorAndStop)
  // in microtasks not connected to any promise chain.
  process.on('uncaughtException', (e) => {
    console.error('Worker uncaught exception (suppressed):', e.message);
  });
  process.on('unhandledRejection', (e) => {
    console.error('Worker unhandled rejection (suppressed):', e instanceof Error ? e.message : e);
  });

  const onMessage = async (msg: WorkerInputMessage): Promise<WorkerOutputMessage> => {
    switch (msg.type) {
      case 'render': {
        return new Promise<SsgWorkerRenderResult>((resolve) => {
          workerRender(sys, opts, msg, pendingPromises, resolve, deps).catch((e) => {
            console.error('Error during render', msg.pathname, e);
            resolve({
              type: 'render',
              pathname: msg.pathname,
              url: '',
              ok: false,
              error: {
                message: e instanceof Error ? e.message : String(e),
                stack: e instanceof Error ? e.stack : undefined,
              },
              filePath: null,
              contentType: null,
              resourceType: null,
            });
          });
        });
      }
      case 'close': {
        if (pendingPromises.size) {
          const promises = Array.from(pendingPromises);
          pendingPromises.clear();
          await Promise.all(promises);
        }
        return { type: 'close' };
      }
    }
  };

  parentPort?.on('message', async (msg: WorkerInputMessage) => {
    try {
      parentPort?.postMessage(await onMessage(msg));
    } catch (e) {
      // Send error result back instead of crashing the worker
      if (msg.type === 'render') {
        const error = e instanceof Error ? e : new Error(String(e));
        parentPort?.postMessage({
          type: 'render',
          pathname: msg.pathname,
          url: '',
          ok: false,
          error: { message: error.message, stack: error.stack },
          filePath: null,
          contentType: null,
          resourceType: null,
        } satisfies WorkerOutputMessage);
      } else {
        console.error('Worker message handler error', e);
      }
    }
    if (msg.type === 'close') {
      parentPort?.close();
    }
  });
}

async function workerRender(
  sys: System,
  opts: SsgHandlerOptions,
  staticRoute: SsgRoute,
  pendingPromises: Set<Promise<any>>,
  callback: (result: SsgWorkerRenderResult) => void,
  deps: WorkerThreadDeps
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
          return createNoopWritableStream() as any;
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
                const qData: ClientPageData = requestEv.sharedMap.get(deps.RequestEvShareQData);
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

                  const serialized = await deps.serialize(qData);
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

    const promise = requestHandlerForSsg(requestCtx, opts, deps)
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
          if (isRedirectMessage(e)) {
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
      .catch((e) => {
        console.error('Unhandled error during request handling', staticRoute.pathname, e);
        result.error = {
          message: String(e),
          stack: e.stack || '',
        };
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

/** Create a fresh no-op WritableStream (must be a real instance for pipeTo checks). */
const createNoopWritableStream = () => new WritableStream();

async function loadSerialize(): Promise<typeof import('@qwik.dev/core/internal')._serialize> {
  // Import qwik after resetting the global singleton so the worker gets a fresh serializer instance.
  const { _serialize: serialize } = await import('@qwik.dev/core/internal');
  return serialize;
}

function isRedirectMessage(value: unknown) {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { constructor?: { name?: string } }).constructor?.name === 'RedirectMessage'
  );
}

async function requestHandlerForSsg<T>(
  serverRequestEv: ServerRequestEvent<T>,
  opts: SsgHandlerOptions,
  deps: WorkerThreadDeps
) {
  const { render, checkOrigin, qwikRouterConfig } = opts;

  if (!qwikRouterConfig) {
    throw new Error('qwikRouterConfig is required.');
  }

  const { pathname, isInternal } = deps.getRouteMatchPathname(serverRequestEv.url.pathname);
  if (pathname === '/.well-known' || pathname.startsWith('/.well-known/')) {
    return null;
  }

  const { routes, serverPlugins, cacheModules } = qwikRouterConfig;
  const loadedRoute = await deps.loadRoute(routes, cacheModules, pathname, isInternal);
  const requestHandlers = deps.resolveRequestHandlers(
    serverPlugins,
    loadedRoute,
    serverRequestEv.request.method,
    checkOrigin ?? true,
    deps.renderQwikMiddleware(render),
    isInternal
  );

  if (qwikRouterConfig.fallthrough && loadedRoute.$notFound$) {
    return null;
  }

  const rebuildRouteInfo = async (url: URL) => {
    const { pathname } = deps.getRouteMatchPathname(url.pathname);
    const loadedRoute = await deps.loadRoute(routes, cacheModules, pathname, isInternal);
    const requestHandlers = deps.resolveRequestHandlers(
      serverPlugins,
      loadedRoute,
      serverRequestEv.request.method,
      checkOrigin ?? true,
      deps.renderQwikMiddleware(render),
      isInternal
    );
    return {
      loadedRoute,
      requestHandlers,
    };
  };

  return deps.runQwikRouter(
    serverRequestEv,
    loadedRoute,
    requestHandlers,
    rebuildRouteInfo,
    qwikRouterConfig.basePathname
  );
}

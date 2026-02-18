/**
 * Worker for rendering, abstracted so it doesn't depend on node:worker_threads
 *
 * It imports the ssgRender function from the SSG entry module, which is dynamically added as an
 * entry during the build.
 */
import type { ServerRequestEvent } from '@qwik.dev/router/middleware/request-handler';
import { pathToFileURL } from 'node:url';
import type { SsgRenderFn } from '../adapters/shared/vite/ssg-render';
import type { ClientPageData } from '../runtime/src/types';
import type {
  SsgOptions,
  SsgRoute,
  SsgWorkerRenderResult,
  StaticStreamWriter,
  System,
} from './types';

let _serialize: (data: ClientPageData) => Promise<string>;
let ssgRender: SsgRenderFn;

export async function workerThread(sys: System) {
  // Special case: we allow importing qwik again in the same process, it's ok because we just needed the serializer
  const opts = sys.getOptions();
  const pendingPromises = new Set<Promise<any>>();
  opts.log = 'debug';
  const log = await sys.createLogger();

  // Check if we have the new SSG entry module path
  const hasSsgEntry = !!opts.ssgEntryModulePath;

  // If we have the new SSG entry, import it
  if (!hasSsgEntry) {
    console.error(
      'SSG entry module path is not set. This means the worker thread cannot load the ssgRender function and serializer. Please ensure you are using the latest version of the SSG adapter and that your build is configured correctly.'
    );
    throw new Error(
      'SSG entry module path is required for the worker thread. Please ensure you are using the latest version of the SSG adapter and that your build is configured correctly.'
    );
  }
  const ssgEntry = await import(pathToFileURL(opts.ssgEntryModulePath!).href);
  ssgRender = ssgEntry.ssgRender;
  if (!ssgRender) {
    console.error(
      `ssgRender function is not exported from the SSG entry module ${opts.ssgEntryModulePath}. Please ensure your SSG entry module exports a ssgRender function.`
    );
    throw new Error(
      `ssgRender function is not exported from the SSG entry module ${opts.ssgEntryModulePath}. Please ensure your SSG entry module exports a ssgRender function.`
    );
  }
  _serialize = ssgEntry._serialize;

  sys
    .createWorkerProcess(async (msg) => {
      switch (msg.type) {
        case 'render': {
          // pathname and origin already normalized at this point
          const url = new URL(msg.pathname, opts.origin);
          log.debug(`Worker thread rendering: ${url}`);
          const result: SsgWorkerRenderResult = {
            type: 'render',
            pathname: url.pathname,
            url: url.href,
            ok: false,
            error: null,
            filePath: null,
            contentType: null,
            resourceType: null,
          };

          const promise = workerRender(result, ssgRender, sys, opts, msg, pendingPromises)
            .catch((e) => {
              console.error('Error during render', msg.pathname, e);
              result.error = {
                message: e.message || String(e),
                stack: e.stack,
              };
              return result;
            })
            .finally(() => {
              pendingPromises.delete(promise);
            });
          pendingPromises.add(promise);

          return promise;
        }
        case 'close': {
          if (pendingPromises.size) {
            log.debug(`Worker thread closing, waiting for ${pendingPromises.size} pending renders`);
            const promises = Array.from(pendingPromises);
            pendingPromises.clear();
            await Promise.all(promises);
          }
          log.debug(`Worker thread closed`);
          return { type: 'close' };
        }
      }
    })
    ?.catch((e) => {
      console.error('Worker process creation failed', e);
    });
}

async function workerRender(
  result: SsgWorkerRenderResult,
  ssgRender: SsgRenderFn,
  sys: System,
  opts: SsgOptions,
  staticRoute: SsgRoute,
  pendingPromises: Set<Promise<any>>
): Promise<SsgWorkerRenderResult> {
  // pathname and origin already normalized at this point
  const url = new URL(staticRoute.pathname, opts.origin);
  const is404ErrorPage = url.pathname.endsWith('/404.html');

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
            // TODO just request the q-data.json directly from the renderer
            // if (writeQDataEnabled) {
            //   const qData: ClientPageData = requestEv.sharedMap.get(RequestEvShareQData);
            //   if (qData && !is404ErrorPage) {
            //     // write q-data.json file when enabled and qData is set
            //     const qDataFilePath = sys.getDataFilePath(url.pathname);
            //     const dataWriter = sys.createWriteStream(qDataFilePath);
            //     dataWriter.on('error', (e) => {
            //       console.error(e);
            //       result.error = {
            //         message: e.message,
            //         stack: e.stack,
            //       };
            //     });

            //     const serialized = await _serialize(qData);
            //     dataWriter.write(serialized);

            //     writePromises.push(
            //       new Promise<void>((resolve) => {
            //         // set the static file path for the result
            //         result.filePath = routeFilePath;
            //         dataWriter.end(resolve);
            //       })
            //     );
            //   }
            // }

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

  await ssgRender(requestCtx, opts)
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
        // if (e instanceof RedirectMessage) {
        //   // TODO We should render a html page for redirects too
        //   // that would require refactoring redirects
        //   return;
        // }
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
    });

  return result;
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

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
import type { ClientPageData } from '../runtime/src/types';

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
    isStatic: true,
    filePath: null,
  };

  const htmlFilePath = sys.getPageFilePath(staticRoute.pathname);
  const dataFilePath = sys.getDataFilePath(staticRoute.pathname);

  const writeHtmlEnabled = opts.emitHtml !== false;
  const writeDataEnabled = opts.emitData !== false && !!dataFilePath;

  if (writeHtmlEnabled || writeDataEnabled) {
    await sys.ensureDir(htmlFilePath);
  }

  try {
    const request = new Request(url);

    const requestCtx: ServerRequestEvent<void> = {
      mode: 'static',
      locale: undefined,
      url,
      request,
      getWritableStream: (status, headers, _, _r, requestEv) => {
        result.ok =
          status >= 200 &&
          status <= 299 &&
          (headers.get('Content-Type') || '').includes('text/html');

        if (!result.ok) {
          return noopWriter;
        }

        const htmlWriter = writeHtmlEnabled ? sys.createWriteStream(htmlFilePath) : null;
        const stream = new WritableStream<Uint8Array>({
          write(chunk) {
            // page html writer
            if (htmlWriter) {
              htmlWriter.write(Buffer.from(chunk.buffer));
            }
          },
          close() {
            const data: ClientPageData = requestEv.sharedMap.get('qData');

            if (writeDataEnabled) {
              if (data) {
                if (typeof data.isStatic === 'boolean') {
                  result.isStatic = data.isStatic;
                }
                const dataWriter = sys.createWriteStream(dataFilePath);
                dataWriter.write(JSON.stringify(data));
                dataWriter.end();
              }
            }

            if (data) {
              if (htmlWriter) {
                return new Promise<void>((resolve) => {
                  result.filePath = htmlFilePath;
                  htmlWriter.end(resolve);
                });
              }
            }
          },
        });
        return stream;
      },
      platform: sys.platform,
    };

    const promise = requestHandler(requestCtx, opts)
      .then((rsp) => {
        if (rsp != null) {
          return rsp.completion;
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
      })
      .finally(() => {
        pendingPromises.delete(promise);
        callback(result);
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

const noopWriter = /*#__PURE__*/ new WritableStream({
  write() {},
  close() {},
});

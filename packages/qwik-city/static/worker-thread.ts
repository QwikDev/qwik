import type {
  StaticGenerateHandlerOptions,
  StaticRoute,
  StaticWorkerRenderResult,
  System,
} from './types';
import type { ServerRequestEvent, RequestContext } from '../middleware/request-handler';
import { createHeaders } from '../middleware/request-handler/headers';
import { requestHandler } from '../middleware/request-handler';
import { pathToFileURL } from 'node:url';
import type { ResponseStreamWriter } from '../middleware/request-handler/types';

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
    isStatic: false,
  };

  const htmlFilePath = sys.getPageFilePath(staticRoute.pathname);
  const dataFilePath = sys.getDataFilePath(staticRoute.pathname);

  const writeHtmlEnabled = opts.emitHtml !== false;
  const writeDataEnabled = opts.emitData !== false && !!dataFilePath;

  if (writeHtmlEnabled || writeDataEnabled) {
    await sys.ensureDir(htmlFilePath);
  }

  try {
    const request = new SsgRequestContext(url);

    const requestCtx: ServerRequestEvent<void> = {
      mode: 'static',
      locale: undefined,
      url,
      request,
      sendHeaders: (status, headers, _, resolve, err) => {
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

        if (!result.ok) {
          return noopWriter;
        }

        const htmlWriter = writeHtmlEnabled ? sys.createWriteStream(htmlFilePath) : null;
        const dataWriter = writeDataEnabled ? sys.createWriteStream(dataFilePath) : null;

        const stream: ResponseStreamWriter = {
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
            if (typeof data.isStatic === 'boolean') {
              result.isStatic = data.isStatic;
            }
          },
          close: () => {
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
          },
        };
        return stream;
      },
      platform: sys.platform,
    };

    const promise = requestHandler(requestCtx, opts)
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

const noopWriter: ResponseStreamWriter = {
  write() {},
  close() {},
};

class SsgRequestContext implements RequestContext {
  url: string;
  headers: Headers;

  constructor(url: URL) {
    this.url = url.href;

    const headers = createHeaders();
    headers.set('Host', url.host);
    headers.set('Accept', 'text/html,application/json');
    headers.set('User-Agent', 'Qwik City SSG');
    this.headers = headers;
  }

  get method() {
    return 'GET';
  }

  async json() {
    return {};
  }

  async text() {
    return '';
  }

  async formData() {
    return new URLSearchParams();
  }
}

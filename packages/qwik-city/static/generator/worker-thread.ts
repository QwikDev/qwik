import type { Render } from '@builder.io/qwik/server';
import type {
  StaticGeneratorOptions,
  StaticWorkerRenderConfig,
  StaticWorkerRenderResult,
  System,
} from './types';
import { requestHandler } from '../../middleware/request-handler';
import { createHeaders } from '../../middleware/request-handler/headers';
import type { QwikCityRequestContext } from '../../middleware/request-handler/types';
import type { RequestContext } from '../../runtime/src/library/types';
import { collectAnchorHrefs, normalizePathname } from './utils';

export async function workerThread(sys: System, render: Render) {
  const opts = sys.getOptions();

  sys.createWorkerProcess(async (config: StaticWorkerRenderConfig) => {
    const result = await workerRender(sys, render, opts, config);
    return result;
  });
}

async function workerRender(
  sys: System,
  render: Render,
  opts: StaticGeneratorOptions,
  config: StaticWorkerRenderConfig
) {
  const timer = sys.createTimer();

  const url = new URL(config.pathname, opts.baseUrl);

  const result: StaticWorkerRenderResult = {
    pathname: config.pathname,
    url: url.href,
    links: [],
    duration: 0,
    status: 0,
    ok: false,
    error: null,
  };

  try {
    const filePath = sys.getIndexFilePath(config.pathname);

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

    const anchorBuffer = { c: '' };
    const links = new Set<string>();

    const requestCtx: QwikCityRequestContext<void> = {
      url,
      request,
      response: async (status, headers, body, err) => {
        result.status = status;

        if (err) {
          if (err.stack) {
            result.error = String(err.stack);
          } else if (err.message) {
            result.error = String(err.message);
          } else {
            result.error = String(err);
          }
          return;
        }

        if (status >= 301 && status <= 308) {
          const redirectPathname = normalizePathname(headers.get('Location'), url);
          if (redirectPathname) {
            links.add(redirectPathname);
          }
          return;
        }

        const isHtml = (headers.get('Content-Type') || '').includes('text/html');
        result.ok = isHtml && status >= 200 && status <= 299;

        if (!result.ok) {
          // don't bother for non OK status or content that's not html
          return;
        }

        await sys.ensureDir(filePath);

        return new Promise((resolve) => {
          const writer = sys.createWriteStream(filePath);
          body({
            write: (chunk) => {
              writer.write(chunk);
              if (typeof chunk === 'string') {
                anchorBuffer.c += chunk;
                collectAnchorHrefs(anchorBuffer, links, url);
              }
            },
          }).finally(() => {
            writer.close(resolve);
          });
        });
      },
    };

    await requestHandler(requestCtx, render, {
      ...opts,
      ...config,
    });

    result.links = Array.from(links);
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
  }

  result.duration = timer();

  return result;
}

import type { Render } from '@builder.io/qwik/server';
import type {
  Logger,
  NormalizedStaticGeneratorOptions,
  StaticWorkerRenderConfig,
  StaticWorkerRenderResult,
  System,
} from './types';
import { requestHandler } from '../../middleware/request-handler';
import { createHeaders } from '../../middleware/request-handler/headers';
import type { QwikCityRequestContext } from '../../middleware/request-handler/types';
import type { RequestContext } from '../../runtime/src/library/types';
import { collectAnchorHrefs } from './utils';

export async function workerStaticRender(
  opts: NormalizedStaticGeneratorOptions,
  log: Logger,
  sys: System,
  render: Render,
  config: StaticWorkerRenderConfig
) {
  const timer = sys.createTimer();

  const url = new URL(config.pathname, opts.baseUrl);

  const result: StaticWorkerRenderResult = {
    url: url.href,
    links: [],
    duration: 0,
    status: 0,
    error: '',
  };

  try {
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
      response: async (status, headers, body) => {
        result.status = status;

        if (status >= 301 && status <= 308) {
          const loc = headers.get('Location');
          if (loc) {
            try {
              const redirectUrl = new URL(loc, url);
              if (redirectUrl.origin === url.origin) {
                links.add(redirectUrl.pathname);
              }
            } catch (e: any) {
              result.error = String(e);
            }
          }
          return;
        }

        const isHtml = (headers.get('Content-Type') || '').includes('text/html');
        if (!isHtml || status < 200 || status >= 300) {
          // don't bother for non OK status or content that's not html
          return;
        }

        await sys.ensureDir(config.filePath);

        return new Promise((resolve) => {
          const writer = sys.createWriteStream(config.filePath);
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
      url: url.href,
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

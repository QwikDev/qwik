import type { AzureFunction, Context, HttpRequest } from '@azure/functions';
import type { RenderOptions } from '@builder.io/qwik';
import type { RequestContext } from '@builder.io/qwik-city';
import type { Render } from '@builder.io/qwik/server';
import qwikCityPlan from '@qwik-city-plan';
import { notFoundHandler, requestHandler } from '../request-handler';
import { createHeaders } from '../request-handler/headers';
import type { QwikCityHandlerOptions, QwikCityRequestContext } from '../request-handler/types';

// @builder.io/qwik-city/middleware/azure-swa

/**
 * @alpha
 */
export function createQwikRequest(req: HttpRequest): RequestContext {
  const url = req.headers['x-ms-original-url']!;

  const headers = createHeaders();
  for (const header in req.headers) {
    headers.set(header, req.headers[header]);
  }

  return {
    method: req.method || 'GET',
    url: url,
    headers,
    formData: () => Promise.resolve(new URLSearchParams(req.params)),
    json: req.body,
    text: req.rawBody,
  };
}

interface AzureResponse {
  status: number;
  headers: { [key: string]: any };
  body?: string;
}

/**
 * @alpha
 */
export function createQwikCity(opts: QwikCityAzureOptions): AzureFunction {
  async function onRequest(context: Context, req: HttpRequest): Promise<void> {
    try {
      const qwikRequest = createQwikRequest(req);

      const requestCtx: QwikCityRequestContext<void> = {
        mode: 'server',
        locale: undefined,
        url: new URL(qwikRequest.url),
        request: qwikRequest,
        response: (status, headers, cookies, body) => {
          const res: AzureResponse = (context.res = {
            status,
            headers: {},
          });
          headers.forEach((value, key) => (res.headers[key] = value));
          return body({
            write(chunk: string) {
              // simple concat because streaming not supported - see https://github.com/Azure/azure-functions-host/issues/1361
              if (res.body) {
                res.body += chunk;
              } else {
                res.body = chunk;
              }
            },
          });
        },
        platform: context,
      };

      // send request to qwik city request handler
      const handledResponse = await requestHandler<void>(requestCtx, opts);
      if (handledResponse !== null) {
        return handledResponse;
      }

      // qwik city did not have a route for this request
      // respond with qwik city's 404 handler
      const notFoundResponse = await notFoundHandler<void>(requestCtx);
      return notFoundResponse;
    } catch (e: any) {
      console.error(e);
      context.res = {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      };
      return Promise.resolve();
    }
  }

  return onRequest;
}

/**
 * @alpha
 */
export interface QwikCityAzureOptions extends QwikCityHandlerOptions {}

/**
 * @alpha
 */
export interface EventPluginContext extends Context {}

/**
 * @alpha
 * @deprecated Please use `createQwikCity()` instead.
 *
 * Example:
 *
 * ```ts
 * import { createQwikCity } from '@builder.io/qwik-city/middleware/azure-swa';
 * import qwikCityPlan from '@qwik-city-plan';
 * import render from './entry.ssr';
 *
 * export default createQwikCity({ render, qwikCityPlan });
 * ```
 */
export function qwikCity(render: Render, opts?: RenderOptions) {
  return createQwikCity({ render, qwikCityPlan, ...opts });
}

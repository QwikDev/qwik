import type { AzureFunction, Context, HttpRequest } from '@azure/functions';
import type { RenderOptions } from '@builder.io/qwik';
import { Render, setServerPlatform } from '@builder.io/qwik/server';
import qwikCityPlan from '@qwik-city-plan';
import {
  mergeHeadersCookies,
  requestHandler,
} from '@builder.io/qwik-city/middleware/request-handler';
import type {
  ServerRenderOptions,
  ServerRequestEvent,
} from '@builder.io/qwik-city/middleware/request-handler';
import { getNotFound } from '@qwik-city-not-found-paths';
import { _deserializeData, _serializeData, _verifySerializable } from '@builder.io/qwik';

// @builder.io/qwik-city/middleware/azure-swa

interface AzureResponse {
  status: number;
  headers: { [key: string]: any };
  body?: string | Uint8Array;
}

/**
 * @alpha
 */
export function createQwikCity(opts: QwikCityAzureOptions): AzureFunction {
  const qwikSerializer = {
    _deserializeData,
    _serializeData,
    _verifySerializable,
  };
  if (opts.manifest) {
    setServerPlatform(opts.manifest);
  }
  async function onAzureSwaRequest(context: Context, req: HttpRequest): Promise<AzureResponse> {
    try {
      const url = new URL(req.headers['x-ms-original-url']!);
      const options = {
        method: req.method,
        headers: req.headers,
        body: req.body,
        duplex: 'half' as any,
      };

      const serverRequestEv: ServerRequestEvent<AzureResponse> = {
        mode: 'server',
        locale: undefined,
        url,
        platform: context,
        env: {
          get(key) {
            return process.env[key];
          },
        },
        request: new Request(url, options as any),
        getWritableStream: (status, headers, cookies, resolve) => {
          const response: AzureResponse = {
            status,
            body: new Uint8Array(),
            headers: {},
          };
          mergeHeadersCookies(headers, cookies).forEach(
            (value, key) => (response.headers[key] = value)
          );
          return new WritableStream({
            write(chunk: Uint8Array) {
              if (response.body instanceof Uint8Array) {
                const newBuffer = new Uint8Array(response.body.length + chunk.length);
                newBuffer.set(response.body);
                newBuffer.set(chunk, response.body.length);
                response.body = newBuffer;
              }
            },
            close() {
              resolve(response);
            },
          });
        },
      };

      // send request to qwik city request handler
      const handledResponse = await requestHandler(serverRequestEv, opts, qwikSerializer);
      if (handledResponse) {
        handledResponse.completion.then((err) => {
          if (err) {
            console.error(err);
          }
        });
        const response = await handledResponse.response;
        if (response) {
          return response;
        }
      }

      // qwik city did not have a route for this request
      // response with 404 for this pathname
      const notFoundHtml = getNotFound(url.pathname);
      return {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Not-Found': url.pathname },
        body: notFoundHtml,
      };
    } catch (e: any) {
      console.error(e);
      return {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      };
    }
  }

  return onAzureSwaRequest;
}

/**
 * @alpha
 */
export interface QwikCityAzureOptions extends ServerRenderOptions {}

/**
 * @alpha
 */
export interface PlatformAzure extends Partial<Context> {}

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

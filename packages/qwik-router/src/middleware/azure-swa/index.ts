import type {
  HttpHandler,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { setServerPlatform } from '@qwik.dev/core/server';
import type {
  ServerRenderOptions,
  ServerRequestEvent,
} from '@qwik.dev/router/middleware/request-handler';
import {
  getErrorHtml,
  isStaticPath,
  requestHandler,
} from '@qwik.dev/router/middleware/request-handler';
import { parseSetCookie } from 'set-cookie-parser';

// @qwik.dev/router/middleware/azure-swa

/** @public */
export function createQwikRouter(opts: QwikRouterAzureOptions): HttpHandler {
  if (opts.manifest) {
    setServerPlatform(opts.manifest);
  }
  async function onAzureSwaRequest(
    req: HttpRequest,
    context: InvocationContext
  ): Promise<HttpResponseInit> {
    try {
      const url = new URL(req.headers.get('x-ms-original-url')!);
      const options = {
        method: req.method || 'GET',
        headers: req.headers,
        body: req.body,
        duplex: 'half',
      };

      const serverRequestEv: ServerRequestEvent<HttpResponseInit> = {
        mode: 'server',
        locale: undefined,
        url,
        platform: context,
        env: {
          get(key) {
            return process.env[key];
          },
        },
        request: new Request(url, options),
        getWritableStream: (status, headers, cookies, resolve) => {
          const chunks: Uint8Array[] = [];
          let bodyLength = 0;
          const responseHeaders: Record<string, string> = {};
          const response: HttpResponseInit = {
            status,
            headers: responseHeaders,
            cookies: parseSetCookie(cookies.headers()).map((cookie) => ({
              ...cookie,
              sameSite:
                cookie.sameSite === 'Strict' ||
                cookie.sameSite === 'Lax' ||
                cookie.sameSite === 'None'
                  ? cookie.sameSite
                  : undefined,
            })),
          };
          headers.forEach((value, key) => (responseHeaders[key] = value));
          return new WritableStream({
            write(chunk: Uint8Array) {
              chunks.push(chunk.slice());
              bodyLength += chunk.length;
            },
            close() {
              const body = new Uint8Array(bodyLength);
              let offset = 0;
              for (const chunk of chunks) {
                body.set(chunk, offset);
                offset += chunk.length;
              }
              response.body = body;
              resolve(response);
            },
          });
        },

        getClientConn: () => {
          return {
            ip: req.headers.get('x-forwarded-client-Ip') ?? undefined,
            country: undefined,
          };
        },
      };

      // send request to qwik router request handler
      const handledResponse = await requestHandler(serverRequestEv, opts);
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

      // No matching route: respond with a minimal 404 (static paths get a plain message).
      const notFoundHtml =
        !req.headers.get('accept')?.includes('text/html') || isStaticPath(req.method || 'GET', url)
          ? 'Not Found'
          : getErrorHtml(404, 'Not Found');
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
 * @deprecated Use `createQwikRouter` instead. Will be removed in V3
 * @public
 */
export const createQwikCity = createQwikRouter;

/** @public */
export interface QwikRouterAzureOptions extends ServerRenderOptions {}

/**
 * @deprecated Use `QwikRouterAzureOptions` instead. Will be removed in V3
 * @public
 */
export type QwikCityAzureOptions = QwikRouterAzureOptions;

/** @public */
export interface PlatformAzure extends Partial<InvocationContext> {}

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
import { parseSetCookieString } from './parse-set-cookie';

// @qwik.dev/router/middleware/azure-swa

// Minimal structural types matching `@azure/functions@3` declarations.

/** @public */
export interface AzureHttpRequest {
  method: string | null;
  url: string;
  headers: { [name: string]: string };
  query: { [name: string]: string };
  params: { [name: string]: string };
  body?: any;
  rawBody?: any;
  bufferBody?: Uint8Array;
}

/** @public */
export interface AzureContext {
  invocationId: string;
  executionContext: {
    invocationId: string;
    functionName: string;
    functionDirectory: string;
  };
  bindings: { [key: string]: any };
  bindingData: { [key: string]: any };
  bindingDefinitions: { name: string; type: string; direction: 'in' | 'out' | 'inout' }[];
  traceContext: {
    traceparent?: string | null;
    tracestate?: string | null;
    attributes?: { [key: string]: string } | null;
  };
  log: ((...args: any[]) => void) & {
    error(...args: any[]): void;
    warn(...args: any[]): void;
    info(...args: any[]): void;
    verbose(...args: any[]): void;
  };
  done(err?: Error | string | null, result?: any): void;
  req?: AzureHttpRequest;
  res?: { [key: string]: any };
}

/** @public */
export type AzureFunction = (context: AzureContext, ...args: any[]) => Promise<any> | void;

interface AzureResponse {
  status: number;
  headers: { [key: string]: any };
  body?: string | Uint8Array;
  cookies?: AzureCookie[];
}

interface AzureCookie {
  /** Cookie name */
  name: string;
  /** Cookie value */
  value: string;
  /** Specifies allowed hosts to receive the cookie */
  domain?: string;
  /** Specifies URL path that must exist in the requested URL */
  path?: string;
  /**
   * NOTE: It is generally recommended that you use maxAge over expires. Sets the cookie to expire
   * at a specific date instead of when the client closes. This can be a Javascript Date or Unix
   * time in milliseconds.
   */
  expires?: Date | number;
  /** Sets the cookie to only be sent with an encrypted request */
  secure?: boolean;
  /** Sets the cookie to be inaccessible to JavaScript's Document.cookie API */
  httpOnly?: boolean;
  /** Can restrict the cookie to not be sent with cross-site requests */
  sameSite?: string | undefined;
  /**
   * Number of seconds until the cookie expires. A zero or negative number will expire the cookie
   * immediately.
   */
  maxAge?: number;
}

/** @public */
export function createQwikRouter(opts: QwikRouterAzureOptions): AzureFunction {
  if (opts.manifest) {
    setServerPlatform(opts.manifest);
  }
  async function onAzureSwaRequest(
    context: AzureContext,
    req: AzureHttpRequest
  ): Promise<AzureResponse> {
    try {
      const url = new URL(req.headers['x-ms-original-url']!);
      const options: RequestInit = {
        method: req.method || 'GET',
        headers: req.headers,
        body: req.bufferBody || req.rawBody || req.body,
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
        request: new Request(url, options),
        getWritableStream: (status, headers, cookies, resolve) => {
          const chunks: Uint8Array[] = [];
          let bodyLength = 0;
          const response: AzureResponse = {
            status,
            headers: {},
            cookies: cookies.headers().map((header) => parseSetCookieString(header)),
          };
          headers.forEach((value, key) => (response.headers[key] = value));
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
            ip: req.headers['x-forwarded-client-Ip'],
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
        !req.headers.accept?.includes('text/html') || isStaticPath(req.method || 'GET', url)
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
export interface PlatformAzure extends Partial<AzureContext> {}

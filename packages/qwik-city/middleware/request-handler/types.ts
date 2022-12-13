import type { StreamWriter } from '@builder.io/qwik';
import type { Render, RenderOptions } from '@builder.io/qwik/server';
import type {
  ServerAction,
  ServerActionInternal,
  ServerLoader,
  ServerLoaderInternal,
} from '../../runtime/src/server-functions';
import type {
  ClientPageData,
  QwikCityMode,
  QwikCityPlan,
  PathParams,
} from '../../runtime/src/types';
import type { ErrorResponse } from './error-handler';
import type { RedirectResponse } from './redirect-handler';

/**
 * Request event created by the server.
 */
export interface ServerRequestEvent<T = any> {
  mode: QwikCityMode;
  url: URL;
  locale: string | undefined;
  platform: any;
  request: RequestContext;
  response: ServerResponseHandler<T>;
}

export type ServerResponseHandler<T = any> = (
  status: number,
  headers: Headers,
  cookies: Cookie,
  body: (stream: ResponseStreamWriter) => Promise<void> | void,
  error?: any
) => T;

export interface ResponseStreamWriter extends StreamWriter {
  clientData?: (data: ClientPageData) => void;
  end: () => void;
}

export interface ServerRenderOptions extends RenderOptions {
  render: Render;
  qwikCityPlan: QwikCityPlan;
}

/**
 * @alpha
 */
export type RequestHandler<PLATFORM = unknown> = (ev: RequestEvent<PLATFORM>) => void;

/**
 * @alpha
 */
export interface RequestEventCommon<PLATFORM = unknown> {
  /**
   * HTTP response status code.
   *
   * https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
   */
  status: (statusCode: number) => void;

  /**
   * Which locale the content is in.
   *
   * The locale value can be retrieved from selected methods using `getLocale()`:
   */
  locale: (local: string) => void;

  /**
   * URL to redirect to. When called, the response will immediately
   * end with the correct redirect status and headers.
   *
   * https://developer.mozilla.org/en-US/docs/Web/HTTP/Redirections
   */
  redirect(status: number, url: string): RedirectResponse;

  /**
   * When called, the response will immediately end with the given
   * status code. This could be useful to end a response with `404`,
   * and use the 404 handler in the routes directory.
   * See https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
   * for which status code should be used.
   */
  error(status: number, message: string): ErrorResponse;

  next(): Promise<void>;

  abort(): void;

  /**
   * HTTP response headers.
   *
   * https://developer.mozilla.org/en-US/docs/Glossary/Response_header
   */
  readonly headers: Headers;

  /**
   * HTTP request and response cookie. Use the `get()` method to retrieve a request cookie value.
   * Use the `set()` method to set a response cookie value.
   */
  readonly cookie: Cookie;

  /**
   * HTTP request method.
   *
   * https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
   */
  readonly method: string;

  /**
   * URL pathname. Does not include the protocol, domain, query string (search params) or hash.
   *
   * https://developer.mozilla.org/en-US/docs/Web/API/URL/pathname
   */
  readonly pathname: string;

  /**
   * URL path params which have been parsed from the current url pathname segments.
   * Use `query` to instead retrieve the query string search params.
   */
  readonly params: Record<string, string>;

  /**
   * URL Query Strings (URL Search Params).
   * Use `params` to instead retrieve the route params found in the url pathname.
   */
  readonly query: URLSearchParams;

  /**
   * HTTP request URL.
   */
  readonly url: URL;

  /**
   * HTTP request information.
   */
  readonly request: RequestContext;

  /**
   * Low-level access to write to the HTTP response stream.
   */
  readonly stream: ResponseStreamWriter;

  /**
   * Platform specific data and functions
   */
  readonly platform: PLATFORM;
}

export interface RequestEvent<PLATFORM = unknown> extends RequestEventCommon<PLATFORM> {
  /**
   * Convenience method to send an HTML body response. The response will be automatically JSON
   * stringify the data and set the `Content-Type` header to
   * `text/html; charset=utf-8`. A send response can only be called once.
   */
  html(status: number, html: string): void;

  /**
   * Convenience method to JSON stringify the data and send it in the response.
   * The response will be automatically set the `Content-Type` header to `application/json; charset=utf-8`.
   * A send response can only be called once.
   */
  json(status: number, data: any): void;

  /**
   * Send a body response. The `Content-Type` response header is not automatically set
   * when using `send()` and must be set manually. A send response can only be called once.
   */
  send(status: number, data: any): void;
}

/**
 * @alpha
 */
export interface RequestEventLoader<PLATFORM = unknown> extends RequestEventCommon<PLATFORM> {
  getData: GetData;
}

export interface GetData {
  <T>(loader: ServerLoader<T>): Promise<T>;
  <T>(loader: ServerAction<T>): Promise<T | undefined>;
}

export interface GetSyncData {
  <T>(loader: ServerLoader<T>): T;
  <T>(loader: ServerAction<T>): T | undefined;
}

export interface RequestContext {
  /**
   * HTTP request headers.
   *
   * https://developer.mozilla.org/en-US/docs/Glossary/Request_header
   */
  readonly headers: Headers;

  /**
   * HTTP request method.
   *
   * https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
   */
  readonly method: string;

  /**
   * HTTP request URL.
   */
  readonly url: string;

  /**
   * HTTP request form data.
   *
   * https://developer.mozilla.org/en-US/docs/Web/API/FormData
   */
  formData(): Promise<FormData>;

  /**
   * HTTP request json data.
   *
   * https://developer.mozilla.org/en-US/docs/Web/API/Request/json
   */
  json(): Promise<any>;

  /**
   * HTTP request text data.
   *
   * https://developer.mozilla.org/en-US/docs/Web/API/Request/text
   */
  text(): Promise<string>;
}

/**
 * Internal data modified by the user.
 */
export interface UserResponseContext {
  type: 'endpoint' | 'pagehtml' | 'pagedata';
  url: URL;
  locale: string | undefined;
  params: PathParams;
  status: number;
  headers: Headers;
  cookie: Cookie;
  loaders: Record<string, Promise<any>>;
  aborted: boolean;
  requestHandlers: RequestHandler[];
  serverLoaders: ServerLoaderInternal[];
  serverActions: ServerActionInternal[];
  routeModuleIndex: number;
  stream: ResponseStreamWriter;
  writeQueue: any[];
  isEnded: boolean;
}

// export interface QwikCityDevRequestContext extends QwikCityRequestContext {
//   routesDir: string;
// }

/**
 * @alpha
 */
export interface Cookie {
  /**
   * Gets a `Request` cookie header value by name.
   */
  get(name: string): CookieValue | null;
  /**
   * Checks if the `Request` cookie header name exists.
   */
  has(name: string): boolean;
  /**
   * Sets a `Response` cookie header using the `Set-Cookie` header.
   */
  set(name: string, value: string | number | Record<string, any>, options?: CookieOptions): void;
  /**
   * Deletes cookie value by name using the `Response` cookie header.
   */
  delete(name: string, options?: Pick<CookieOptions, 'path' | 'domain'>): void;
  /**
   * Returns an array of all the set `Response` `Set-Cookie` header values.
   */
  headers(): string[];
}

/**
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie
 * @alpha
 */
export interface CookieOptions {
  /**
   * Defines the host to which the cookie will be sent. If omitted, this attribute defaults
   * to the host of the current document URL, not including subdomains.
   */
  domain?: string;
  /**
   * Indicates the maximum lifetime of the cookie as an HTTP-date timestamp.
   * If both `expires` and `maxAge` are set, `maxAge` has precedence.
   */
  expires?: Date | string;
  /**
   * Forbids JavaScript from accessing the cookie, for example, through the `document.cookie` property.
   */
  httpOnly?: boolean;
  /**
   * Indicates the number of seconds until the cookie expires. A zero or negative number will
   * expire the cookie immediately. If both `expires` and `maxAge` are set, `maxAge` has precedence.
   * You can also use the array syntax to set the max-age using minutes, hours, days or weeks.
   * For example, `{ maxAge: [3, "days"] }` would set the cookie to expire in 3 days.
   */
  maxAge?: number | [number, 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks'];
  /**
   * Indicates the path that must exist in the requested URL for the browser to send the Cookie header.
   */
  path?: string;
  /**
   * Controls whether or not a cookie is sent with cross-site requests, providing some protection
   * against cross-site request forgery attacks (CSRF).
   */
  sameSite?: 'strict' | 'lax' | 'none';
  /**
   * Indicates that the cookie is sent to the server only when a request is made with
   * the `https:` scheme (except on localhost)
   */
  secure?: boolean;
}

/**
 * @alpha
 */
export interface CookieValue {
  value: string;
  json: <T = unknown>() => T;
  number: () => number;
}

/**
 * @alpha
 */
export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'HEAD'
  | 'OPTIONS'
  | 'CONNECT'
  | 'TRACE';

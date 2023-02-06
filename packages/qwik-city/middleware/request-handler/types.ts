import type { Render, RenderOptions } from '@builder.io/qwik/server';
import type { QwikCityPlan, FailReturn, Action, Loader } from '@builder.io/qwik-city';
import type { ErrorResponse } from './error-handler';
import type { AbortMessage, RedirectMessage } from './redirect-handler';
import type { RequestEventInternal } from './request-event';

export interface EnvGetter {
  get(key: string): string | undefined;
}

/**
 * @alpha
 * Request event created by the server.
 */
export interface ServerRequestEvent<T = any> {
  mode: ServerRequestMode;
  url: URL;
  locale: string | undefined;
  platform: any;
  request: Request;
  env: EnvGetter;
  getWritableStream: ServerResponseHandler<T>;
}

/**
 * @alpha
 */
export type ServerRequestMode = 'dev' | 'static' | 'server';

/**
 * @alpha
 */
export type ServerResponseHandler<T = any> = (
  status: number,
  headers: Headers,
  cookies: Cookie,
  resolve: (response: T) => void,
  requestEv: RequestEventInternal
) => WritableStream<Uint8Array>;

/**
 * @alpha
 */
export interface ServerRenderOptions extends RenderOptions {
  render: Render;
  qwikCityPlan: QwikCityPlan;
}

/**
 * @alpha
 */
export type RequestHandler<PLATFORM = unknown> = (
  ev: RequestEvent<PLATFORM>
) => Promise<void> | void;

/**
 * @alpha
 */
export interface SendMethod {
  (statusCode: number, data: any): AbortMessage;
  (response: Response): AbortMessage;
}

export type RedirectCode = 301 | 302 | 303 | 307 | 308;

/**
 * @alpha
 */
export interface RequestEventCommon<PLATFORM = unknown> {
  /**
   * HTTP response status code. Sets the status code when called with an
   * argument. Always returns the status code, so calling `status()` without
   * an argument will can be used to return the current status code.
   *
   * https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
   */
  readonly status: (statusCode?: number) => number;

  /**
   * Which locale the content is in.
   *
   * The locale value can be retrieved from selected methods using `getLocale()`:
   */
  readonly locale: (local?: string) => string;

  /**
   * URL to redirect to. When called, the response will immediately
   * end with the correct redirect status and headers.
   *
   * https://developer.mozilla.org/en-US/docs/Web/HTTP/Redirections
   */
  readonly redirect: (statusCode: RedirectCode, url: string) => RedirectMessage;

  /**
   * When called, the response will immediately end with the given
   * status code. This could be useful to end a response with `404`,
   * and use the 404 handler in the routes directory.
   * See https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
   * for which status code should be used.
   */
  readonly error: (statusCode: number, message: string) => ErrorResponse;

  /**
   * Convenience method to send an text body response. The response will be automatically
   * set the `Content-Type` header to`text/plain; charset=utf-8`.
   *  An `text()` response can only be called once.
   */
  readonly text: (statusCode: number, text: string) => AbortMessage;

  /**
   * Convenience method to send an HTML body response. The response will be automatically
   * set the `Content-Type` header to`text/html; charset=utf-8`.
   *  An `html()` response can only be called once.
   */
  readonly html: (statusCode: number, html: string) => AbortMessage;

  /**
   * Convenience method to JSON stringify the data and send it in the response.
   * The response will be automatically set the `Content-Type` header to
   * `application/json; charset=utf-8`. A `json()` response can only be called once.
   */
  readonly json: (statusCode: number, data: any) => AbortMessage;

  /**
   * Send a body response. The `Content-Type` response header is not automatically set
   * when using `send()` and must be set manually. A `send()` response can only be called once.
   */
  readonly send: SendMethod;

  readonly exit: () => AbortMessage;

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
  readonly params: Readonly<Record<string, string>>;

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
  readonly request: Request;

  /**
   * Platform specific data and functions
   */
  readonly platform: PLATFORM;

  /**
   * Platform provided environment variables.
   */
  readonly env: EnvGetter;

  /**
   * Shared Map across all the request handlers. Every HTTP request will get a new instance of
   * the shared map. The shared map is useful for sharing data between request handlers.
   */
  readonly sharedMap: Map<string, any>;
}

/**
 * @alpha
 */
export type CacheControl =
  | CacheControlOptions
  | number
  | 'day'
  | 'week'
  | 'month'
  | 'year'
  | 'no-cache'
  | 'immutable'
  | 'private';

/**
 * @alpha
 */
export interface CacheControlOptions {
  /**
   * The max-age=N response directive indicates that the response remains fresh until N seconds after the response is generated.
   * Note that max-age is not the elapsed time since the response was received; it is the elapsed time since the response was generated on the origin server. So if the other cache(s) — on the network route taken by the response — store the response for 100 seconds (indicated using the Age response header field), the browser cache would deduct 100 seconds from its freshness lifetime.
   */
  maxAge?: number;

  /**
   * The s-maxage response directive also indicates how long the response is fresh for (similar to max-age) — but it is specific to shared caches, and they will ignore max-age when it is present.
   */
  sMaxAge?: number;

  /**
   * The stale-while-revalidate response directive indicates that the cache could reuse a stale response while it revalidates it to a cache.
   */
  staleWhileRevalidate?: number;

  /**
   * The no-store response directive indicates that any caches of any kind (private or shared) should not store this response.
   */
  noStore?: boolean;

  /**
   * The no-cache response directive indicates that the response can be stored in caches, but the response must be validated with the origin server before each reuse, even when the cache is disconnected from the origin server.
   */
  noCache?: boolean;

  /**
   * The public response directive indicates that the response can be stored in a shared cache.
   * Responses for requests with Authorization header fields must not be stored in a shared cache; however, the public directive will cause such responses to be stored in a shared cache.
   */
  public?: boolean;

  /**
   * The private response directive indicates that the response can be stored only in a private cache (e.g. local caches in browsers).
   * You should add the private directive for user-personalized content, especially for responses received after login and for sessions managed via cookies.
   * If you forget to add private to a response with personalized content, then that response can be stored in a shared cache and end up being reused for multiple users, which can cause personal information to leak.
   */
  private?: boolean;

  /**
   * The immutable response directive indicates that the response will not be updated while it's fresh.
   *
   * A modern best practice for static resources is to include version/hashes in their URLs, while never modifying the resources — but instead, when necessary, updating the resources with newer versions that have new version-numbers/hashes, so that their URLs are different. That's called the cache-busting pattern.
   */
  immutable?: boolean;
}

/**
 * @alpha
 */
export interface RequestEvent<PLATFORM = unknown> extends RequestEventCommon<PLATFORM> {
  readonly headersSent: boolean;
  readonly exited: boolean;
  readonly cacheControl: (cacheControl: CacheControl) => void;

  /**
   * Low-level access to write to the HTTP response stream. Once `getWritableStream()` is called,
   * the status and headers can no longer be modified and will be sent over the network.
   */
  readonly getWritableStream: () => WritableStream<Uint8Array>;

  readonly next: () => Promise<void>;
}

/**
 * @alpha
 */
export interface RequestEventAction<PLATFORM = unknown> extends RequestEventCommon<PLATFORM> {
  fail: <T extends Record<string, any>>(status: number, returnData: T) => FailReturn<T>;
}

/**
 * @alpha
 */
export interface RequestEventLoader<PLATFORM = unknown> extends RequestEventAction<PLATFORM> {
  getData: GetData;
}

/**
 * @alpha
 */
export interface GetData {
  <T>(loader: Loader<T>): Awaited<T> extends () => any ? never : Promise<T>;
  <T>(loader: Action<T>): Promise<T | undefined>;
}

/**
 * @alpha
 */
export interface GetSyncData {
  <T>(loader: Loader<T>): Awaited<T> extends () => any ? never : Awaited<T>;
  <T>(action: Action<T>): Awaited<T> | undefined;
}

/**
 * @alpha
 */
export interface Cookie {
  /**
   * Gets a `Request` cookie header value by name.
   */
  get(name: string): CookieValue | null;
  /**
   * Gets all `Request` cookie headers.
   */
  getAll(): Record<string, CookieValue>;
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
 * @alpha
 */

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

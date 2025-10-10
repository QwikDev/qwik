import type { _deserialize, _serialize, _verifySerializable } from '@qwik.dev/core/internal';
import type { Render, RenderOptions } from '@qwik.dev/core/server';
import type { Action, FailReturn, Loader, QwikCityPlan, QwikRouterConfig } from '@qwik.dev/router';
import type { ServerError } from './server-error';
import type { AbortMessage, RedirectMessage } from './redirect-handler';
import type { RequestEventInternal } from './request-event';
import type { RewriteMessage } from './rewrite-handler';

/** @public */
export interface EnvGetter {
  get(key: string): string | undefined;
}

/** @public */
export interface ClientConn {
  ip?: string;
  country?: string;
}

/**
 * @public
 * Request event created by the server.
 */
export interface ServerRequestEvent<T = unknown> {
  mode: ServerRequestMode;
  url: URL;
  locale: string | undefined;
  platform: QwikRouterPlatform;
  request: Request;
  env: EnvGetter;
  getClientConn: () => ClientConn;
  getWritableStream: ServerResponseHandler<T>;
}

/** @public */
export type ServerRequestMode = 'dev' | 'static' | 'server';

/** @public */
export type ServerResponseHandler<T = any> = (
  status: number,
  headers: Headers,
  cookies: Cookie,
  resolve: (response: T) => void,
  requestEv: RequestEventInternal
) => WritableStream<Uint8Array>;

/** @public */
export interface ServerRenderOptions extends RenderOptions {
  render: Render;

  /** @deprecated Not used */
  qwikCityPlan?: QwikCityPlan;

  /** @deprecated Not used */
  qwikRouterConfig?: QwikRouterConfig;
  /**
   * Protection against cross-site request forgery (CSRF) attacks.
   *
   * When `true`, for every incoming POST, PUT, PATCH, or DELETE form submissions, the request
   * origin is checked to match the server's origin. `lax-proto` is for SSL-terminating proxies
   *
   * Be careful when disabling this option as it may lead to CSRF attacks.
   *
   * Defaults to `true`.
   */
  checkOrigin?: boolean | 'lax-proto';
}

/** @public */
export type RequestHandler<PLATFORM = QwikRouterPlatform> = (
  ev: RequestEvent<PLATFORM>
) => Promise<void> | void;

/** @public */
export interface SendMethod {
  (statusCode: StatusCodes, data: any): AbortMessage;
  (response: Response): AbortMessage;
}

export type StatusCodes =
  | InformationalCode
  | SuccessCode
  | ClientErrorCode
  | ServerErrorCode
  | RedirectCode
  | number;

export type ErrorCodes = ClientErrorCode | ServerErrorCode;

/**
 * HTTP Informational Status Codes Status codes in the 1xx range indicate that the server has
 * received and is processing the request, but no response is available yet.
 */
export type InformationalCode =
  | 100 // Continue
  | 101 // Switching Protocols
  | 102 // Processing
  | 103; // Early Hints

/**
 * HTTP Success Status Codes Status codes in the 2xx range indicate that the client's request was
 * successfully received, understood, and accepted by the server.
 */
type SuccessCode =
  | 200 // OK
  | 201 // Created
  | 202 // Accepted
  | 203 // Non-Authoritative Information
  | 204 // No Content
  | 205 // Reset Content
  | 206 // Partial Content
  | 207 // Multi-Status
  | 208 // Already Reported
  | 226; // IM Used;

/**
 * HTTP Redirect Status Codes Status codes in the 3xx range indicate that further action must be
 * taken by the client to complete the request.
 */
export type RedirectCode =
  | 300 // Multiple Choices
  | 301 // Moved Permanently
  | 302 // Found
  | 303 // See Other
  | 304 // Not Modified
  | 305 // Use Proxy
  | 307 // Temporary Redirect
  | 308; // Permanent Redirect

/**
 * HTTP Client Error Status Codes Status codes in the 4xx range indicate that the client's request
 * was malformed or invalid and could not be understood or processed by the server.
 */
export type ClientErrorCode =
  | 400 // Bad Request
  | 401 // Unauthorized
  | 402 // Payment Required
  | 403 // Forbidden
  | 404 // Not Found
  | 405 // Method Not Allowed
  | 406 // Not Acceptable
  | 407 // Proxy Authentication Required
  | 408 // Request Timeout
  | 409 // Conflict
  | 410 // Gone
  | 411 // Length Required
  | 412 // Precondition Failed
  | 413 // Payload Too Large
  | 414 // URI Too Long
  | 415 // Unsupported Media Type
  | 416 // Range Not Satisfiable
  | 417 // Expectation Failed
  | 418 // I'm a teapot
  | 421 // Misdirected Request
  | 422 // Unprocessable Entity
  | 423 // Locked
  | 424 // Failed Dependency
  | 425 // Too Early
  | 426 // Upgrade Required
  | 428 // Precondition Required
  | 429 // Too Many Requests
  | 431 // Request Header Fields Too Large
  | 451 // Unavailable For Legal Reasons
  | 499; // Client closed request

/**
 * HTTP Server Error Status Codes Status codes in the 5xx range indicate that the server encountered
 * an error or was unable to fulfill the request due to unexpected conditions.
 */
export type ServerErrorCode =
  | 500 // Internal Server Error
  | 501 // Not Implemented
  | 502 // Bad Gateway
  | 503 // Service Unavailable
  | 504 // Gateway Timeout
  | 505 // HTTP Version Not Supported
  | 506 // Variant Also Negotiates
  | 507 // Insufficient Storage
  | 508 // Loop Detected
  | 510 // Not Extended
  | 511; // Network Authentication Required

/** @public */
export interface RequestEventCommon<PLATFORM = QwikRouterPlatform>
  extends RequestEventBase<PLATFORM> {
  /**
   * HTTP response status code. Sets the status code when called with an argument. Always returns
   * the status code, so calling `status()` without an argument will can be used to return the
   * current status code.
   *
   * https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
   */
  readonly status: (statusCode?: StatusCodes) => number;

  /**
   * Which locale the content is in.
   *
   * The locale value can be retrieved from selected methods using `getLocale()`:
   */
  readonly locale: (local?: string) => string;

  /**
   * URL to redirect to. When called, the response will immediately end with the correct redirect
   * status and headers.
   *
   * https://developer.mozilla.org/en-US/docs/Web/HTTP/Redirections
   */
  readonly redirect: (statusCode: RedirectCode, url: string) => RedirectMessage;

  /**
   * When called, qwik-router will execute the path's matching route flow.
   *
   * The url in the browser will remain unchanged.
   *
   * @param pathname - The pathname to rewrite to.
   */
  readonly rewrite: (pathname: string) => RewriteMessage;

  /**
   * When called, the response will immediately end with the given status code. This could be useful
   * to end a response with `404`, and use the 404 handler in the routes directory. See
   * https://developer.mozilla.org/en-US/docs/Web/HTTP/Status for which status code should be used.
   */
  readonly error: <T = any>(statusCode: ErrorCodes, message: T) => ServerError<T>;

  /**
   * Convenience method to send an text body response. The response will be automatically set the
   * `Content-Type` header to`text/plain; charset=utf-8`. An `text()` response can only be called
   * once.
   */
  readonly text: (statusCode: StatusCodes, text: string) => AbortMessage;

  /**
   * Convenience method to send an HTML body response. The response will be automatically set the
   * `Content-Type` header to`text/html; charset=utf-8`. An `html()` response can only be called
   * once.
   */
  readonly html: (statusCode: StatusCodes, html: string) => AbortMessage;

  /**
   * Convenience method to JSON stringify the data and send it in the response. The response will be
   * automatically set the `Content-Type` header to `application/json; charset=utf-8`. A `json()`
   * response can only be called once.
   */
  readonly json: (statusCode: StatusCodes, data: any) => AbortMessage;

  /**
   * Send a body response. The `Content-Type` response header is not automatically set when using
   * `send()` and must be set manually. A `send()` response can only be called once.
   */
  readonly send: SendMethod;

  readonly exit: () => AbortMessage;
}

/** @public */
export interface RequestEventBase<PLATFORM = QwikRouterPlatform> {
  /**
   * HTTP response headers. Notice it will be empty until you first add a header. If you want to
   * read the request headers, use `request.headers` instead.
   *
   * https://developer.mozilla.org/en-US/docs/Glossary/Response_header
   */
  readonly headers: Headers;

  /**
   * HTTP request and response cookie. Use the `get()` method to retrieve a request cookie value.
   * Use the `set()` method to set a response cookie value.
   *
   * https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies
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
   * URL path params which have been parsed from the current url pathname segments. Use `query` to
   * instead retrieve the query string search params.
   */
  readonly params: Readonly<Record<string, string>>;

  /**
   * URL Query Strings (URL Search Params). Use `params` to instead retrieve the route params found
   * in the url pathname.
   *
   * https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams
   */
  readonly query: URLSearchParams;

  /** HTTP request URL. */
  readonly url: URL;

  /**
   * The original HTTP request URL.
   *
   * This property was introduced to support the rewrite feature.
   *
   * If rewrite is called, the url property will be changed to the rewritten url. while originalUrl
   * will stay the same(e.g the url inserted to the address bar).
   *
   * If rewrite is never called as part of the request, the url property and the originalUrl are
   * equal.
   */
  readonly originalUrl: URL;

  /** The base pathname of the request, which can be configured at build time. Defaults to `/`. */
  readonly basePathname: string;

  /** HTTP request information. */
  readonly request: Request;

  /** Platform specific data and functions */
  readonly platform: PLATFORM;

  /** Platform provided environment variables. */
  readonly env: EnvGetter;

  /**
   * Shared Map across all the request handlers. Every HTTP request will get a new instance of the
   * shared map. The shared map is useful for sharing data between request handlers.
   */
  readonly sharedMap: Map<string, any>;

  /**
   * This method will check the request headers for a `Content-Type` header and parse the body
   * accordingly. It supports `application/json`, `application/x-www-form-urlencoded`, and
   * `multipart/form-data` content types.
   *
   * If the `Content-Type` header is not set, it will return `null`.
   */
  readonly parseBody: () => Promise<unknown>;

  /**
   * Convenience method to set the Cache-Control header. Depending on your CDN, you may want to add
   * another cacheControl with the second argument set to `CDN-Cache-Control` or any other value (we
   * provide the most common values for auto-complete, but you can use any string you want).
   *
   * See https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control and
   * https://qwik.dev/docs/caching/#CDN-Cache-Controls for more information.
   */
  readonly cacheControl: (cacheControl: CacheControl, target?: CacheControlTarget) => void;

  /**
   * Provides information about the client connection, such as the IP address and the country the
   * request originated from.
   */
  readonly clientConn: ClientConn;

  /**
   * Request's AbortSignal (same as `request.signal`). This signal indicates that the request has
   * been aborted.
   */
  readonly signal: AbortSignal;
}

/** @public */
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

/** @public */
export interface CacheControlOptions {
  /**
   * The max-age=N response directive indicates that the response remains fresh until N seconds
   * after the response is generated. Note that max-age is not the elapsed time since the response
   * was received; it is the elapsed time since the response was generated on the origin server. So
   * if the other cache(s) — on the network route taken by the response — store the response for 100
   * seconds (indicated using the Age response header field), the browser cache would deduct 100
   * seconds from its freshness lifetime.
   */
  maxAge?: number;

  /**
   * The s-maxage response directive also indicates how long the response is fresh for (similar to
   * max-age) — but it is specific to shared caches, and they will ignore max-age when it is
   * present.
   */
  sMaxAge?: number;

  /**
   * The stale-while-revalidate response directive indicates that the cache could reuse a stale
   * response while it revalidates it to a cache.
   */
  staleWhileRevalidate?: number;

  /**
   * The stale-if-error response directive that indicates if a stale response can be used when
   * there's an error from the origin.
   */
  staleIfError?: number;

  /**
   * The no-store response directive indicates that any caches of any kind (private or shared)
   * should not store this response.
   */
  noStore?: boolean;

  /**
   * The no-cache response directive indicates that the response can be stored in caches, but the
   * response must be validated with the origin server before each reuse, even when the cache is
   * disconnected from the origin server.
   */
  noCache?: boolean;

  /**
   * The public response directive indicates that the response can be stored in a shared cache.
   * Responses for requests with Authorization header fields must not be stored in a shared cache;
   * however, the public directive will cause such responses to be stored in a shared cache.
   */
  public?: boolean;

  /**
   * The private response directive indicates that the response can be stored only in a private
   * cache (e.g. local caches in browsers). You should add the private directive for
   * user-personalized content, especially for responses received after login and for sessions
   * managed via cookies. If you forget to add private to a response with personalized content, then
   * that response can be stored in a shared cache and end up being reused for multiple users, which
   * can cause personal information to leak.
   */
  private?: boolean;

  /**
   * The immutable response directive indicates that the response will not be updated while it's
   * fresh.
   *
   * A modern best practice for static resources is to include version/hashes in their URLs, while
   * never modifying the resources — but instead, when necessary, updating the resources with newer
   * versions that have new version-numbers/hashes, so that their URLs are different. That's called
   * the cache-busting pattern.
   */
  immutable?: boolean;
}

/** @public */
export type CacheControlTarget =
  | 'Cache-Control'
  | 'CDN-Cache-Control'
  | 'Cloudflare-CDN-Cache-Control'
  | 'Vercel-CDN-Cache-Control'
  | '~ANY-OTHER-STRING'
  | (string & {});

/** @public */
export interface RequestEvent<PLATFORM = QwikRouterPlatform> extends RequestEventCommon<PLATFORM> {
  /** True if headers have been sent, preventing any more headers from being set. */
  readonly headersSent: boolean;

  /** True if the middleware chain has finished executing. */
  readonly exited: boolean;
  /**
   * Low-level access to write to the HTTP response stream. Once `getWritableStream()` is called,
   * the status and headers can no longer be modified and will be sent over the network.
   */
  readonly getWritableStream: () => WritableStream<Uint8Array>;

  /**
   * Invoke the next middleware function in the chain.
   *
   * NOTE: Ensure that the call to `next()` is `await`ed.
   */
  readonly next: () => Promise<void>;
}

declare global {
  interface QwikRouterPlatform {}
}

/** @public */
export interface RequestEventAction<PLATFORM = QwikRouterPlatform>
  extends RequestEventCommon<PLATFORM> {
  fail: <T extends Record<string, any>>(status: number, returnData: T) => FailReturn<T>;
}

/** @public */
export type DeferReturn<T> = () => Promise<T>;

/** @public */
export interface RequestEventLoader<PLATFORM = QwikRouterPlatform>
  extends RequestEventAction<PLATFORM> {
  resolveValue: ResolveValue;
  defer: <T>(returnData: Promise<T> | (() => Promise<T>)) => DeferReturn<T>;
}

/** @public */
export interface ResolveValue {
  <T>(loader: Loader<T>): Awaited<T> extends () => any ? never : Promise<T>;
  <T>(action: Action<T>): Promise<T | undefined>;
}

/** @public */
export interface ResolveSyncValue {
  <T>(loader: Loader<T>): Awaited<T> extends () => any ? never : Awaited<T>;
  <T>(action: Action<T>): Awaited<T> | undefined;
}

/** @public */
export interface Cookie {
  /** Gets a `Request` cookie header value by name. */
  get(name: string): CookieValue | null;
  /** Gets all `Request` cookie headers. */
  getAll(): Record<string, CookieValue>;
  /** Checks if the `Request` cookie header name exists. */
  has(name: string): boolean;
  /** Sets a `Response` cookie header using the `Set-Cookie` header. */
  set(name: string, value: string | number | Record<string, any>, options?: CookieOptions): void;
  /**
   * Appends a `Response` cookie header using the `Set-Cookie` header.
   *
   * The difference between `set()` and `append()` is that if the specified header already exists,
   * `set()` will overwrite the existing value with the new one, whereas `append()` will append the
   * new value onto the end of the set of values.
   */
  append(name: string, value: string | number | Record<string, any>, options?: CookieOptions): void;
  /** Deletes cookie value by name using the `Response` cookie header. */
  delete(name: string, options?: Pick<CookieOptions, 'path' | 'domain' | 'sameSite'>): void;
  /** Returns an array of all the set `Response` `Set-Cookie` header values. */
  headers(): string[];
}

/** @public */

/**
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie
 *
 * @public
 */
export interface CookieOptions {
  /**
   * Defines the host to which the cookie will be sent. If omitted, this attribute defaults to the
   * host of the current document URL, not including subdomains.
   */
  domain?: string;
  /**
   * Indicates the maximum lifetime of the cookie as an HTTP-date timestamp. If both `expires` and
   * `maxAge` are set, `maxAge` has precedence.
   */
  expires?: Date | string;
  /**
   * Forbids JavaScript from accessing the cookie, for example, through the `document.cookie`
   * property.
   */
  httpOnly?: boolean;
  /**
   * Indicates the number of seconds until the cookie expires. A zero or negative number will expire
   * the cookie immediately. If both `expires` and `maxAge` are set, `maxAge` has precedence. You
   * can also use the array syntax to set the max-age using minutes, hours, days or weeks. For
   * example, `{ maxAge: [3, "days"] }` would set the cookie to expire in 3 days.
   */
  maxAge?: number | [number, 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks'];
  /**
   * Indicates the path that must exist in the requested URL for the browser to send the Cookie
   * header.
   */
  path?: string;
  /**
   * Controls whether or not a cookie is sent with cross-site requests, providing some protection
   * against cross-site request forgery attacks (CSRF).
   */
  sameSite?: 'strict' | 'lax' | 'none' | 'Strict' | 'Lax' | 'None' | boolean;
  /**
   * Indicates that the cookie is sent to the server only when a request is made with the `https:`
   * scheme (except on localhost)
   */
  secure?: boolean;
}

/** @public */
export interface CookieValue {
  value: string;
  json: <T = unknown>() => T;
  number: () => number;
}

/** @public */
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

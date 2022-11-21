import type { StreamWriter } from '@builder.io/qwik';
import type { Render, RenderOptions } from '@builder.io/qwik/server';
import type {
  ClientPageData,
  QwikCityMode,
  QwikCityPlan,
  RequestContext,
  RouteParams,
} from '../../runtime/src/types';

export interface QwikCityRequestContext<T = any> {
  request: RequestContext;
  response: ResponseHandler<T>;
  url: URL;
  platform: Record<string, any>;
  locale: string | undefined;
  mode: QwikCityMode;
}

export interface QwikCityDevRequestContext extends QwikCityRequestContext {
  routesDir: string;
}

export interface ResponseStreamWriter extends StreamWriter {
  clientData?: (data: ClientPageData) => void;
}

export type ResponseHandler<T = any> = (
  status: number,
  headers: Headers,
  cookies: Cookie,
  body: (stream: ResponseStreamWriter) => Promise<void>,
  error?: any
) => Promise<T>;

export interface UserResponseContext {
  type: 'endpoint' | 'pagehtml' | 'pagedata';
  url: URL;
  params: RouteParams;
  status: number;
  headers: Headers;
  cookie: Cookie;
  resolvedBody: string | number | boolean | null | undefined;
  pendingBody: Promise<string | number | boolean | null | undefined> | undefined;
  aborted: boolean;
}

export interface QwikCityHandlerOptions extends RenderOptions {
  render: Render;
  qwikCityPlan: QwikCityPlan;
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

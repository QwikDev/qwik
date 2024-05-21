import type { Cookie as CookieInterface, CookieOptions, CookieValue } from './types';

const SAMESITE = {
  lax: 'Lax',
  Lax: 'Lax',
  None: 'None',
  none: 'None',
  strict: 'Strict',
  Strict: 'Strict',
} as const;

const UNIT = {
  seconds: 1,
  minutes: 1 * 60,
  hours: 1 * 60 * 60,
  days: 1 * 60 * 60 * 24,
  weeks: 1 * 60 * 60 * 24 * 7,
};

const createSetCookieValue = (cookieName: string, cookieValue: string, options: CookieOptions) => {
  const c = [`${cookieName}=${cookieValue}`];

  if (typeof options.domain === 'string') {
    c.push(`Domain=${options.domain}`);
  }

  // If both Expires and Max-Age are set, Max-Age has precedence.
  if (typeof options.maxAge === 'number') {
    c.push(`Max-Age=${options.maxAge}`);
  } else if (Array.isArray(options.maxAge)) {
    c.push(`Max-Age=${options.maxAge[0] * UNIT[options.maxAge[1]]}`);
  } else if (typeof options.expires === 'number' || typeof options.expires == 'string') {
    c.push(`Expires=${options.expires}`);
  } else if (options.expires instanceof Date) {
    c.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.httpOnly) {
    c.push('HttpOnly');
  }

  if (typeof options.path === 'string') {
    c.push(`Path=${options.path}`);
  }

  const sameSite = resolveSameSite(options.sameSite);
  if (sameSite) {
    c.push(`SameSite=${sameSite}`);
  }

  if (options.secure) {
    c.push('Secure');
  }

  return c.join('; ');
};

function tryDecodeUriComponent(str: string) {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

const parseCookieString = (cookieString: string | undefined | null) => {
  const cookie: Record<string, string> = {};
  if (typeof cookieString === 'string' && cookieString !== '') {
    const cookieSegments = cookieString.split(';');
    for (const cookieSegment of cookieSegments) {
      const separatorIndex = cookieSegment.indexOf('=');
      if (separatorIndex !== -1) {
        cookie[tryDecodeUriComponent(cookieSegment.slice(0, separatorIndex).trim())] =
          tryDecodeUriComponent(cookieSegment.slice(separatorIndex + 1).trim());
      }
    }
  }
  return cookie;
};

function resolveSameSite(sameSite: CookieOptions['sameSite']) {
  if (sameSite === true) {
    return 'Strict';
  }
  if (sameSite === false) {
    return 'None';
  }
  if (sameSite) {
    return SAMESITE[sameSite];
  }
  return undefined;
}

const REQ_COOKIE = Symbol('request-cookies');
const RES_COOKIE = Symbol('response-cookies');
const LIVE_COOKIE = Symbol('live-cookies');

export class Cookie implements CookieInterface {
  private [REQ_COOKIE]: Record<string, string>;
  private [RES_COOKIE]: Record<string, string> = {};
  private [LIVE_COOKIE]: Record<string, string | null> = {};
  private appendCounter = 0;

  constructor(cookieString?: string | undefined | null) {
    this[REQ_COOKIE] = parseCookieString(cookieString);
    this[LIVE_COOKIE] = { ...this[REQ_COOKIE] };
  }

  get(cookieName: string, live: boolean = true) {
    const value = this[live ? LIVE_COOKIE : REQ_COOKIE][cookieName];
    if (!value) {
      return null;
    }
    return {
      value,
      json() {
        return JSON.parse(value);
      },
      number() {
        return Number(value);
      },
    };
  }

  getAll(live: boolean = true) {
    return Object.keys(this[live ? LIVE_COOKIE : REQ_COOKIE]).reduce(
      (cookies, cookieName) => {
        cookies[cookieName] = this.get(cookieName)!;
        return cookies;
      },
      {} as Record<string, CookieValue>
    );
  }

  has(cookieName: string, live: boolean = true) {
    return !!this[live ? LIVE_COOKIE : REQ_COOKIE][cookieName];
  }

  set(
    cookieName: string,
    cookieValue: string | number | Record<string, any>,
    options: CookieOptions = {}
  ) {
    this[LIVE_COOKIE][cookieName] =
      typeof cookieValue === 'string' ? cookieValue : JSON.stringify(cookieValue);

    const resolvedValue =
      typeof cookieValue === 'string'
        ? cookieValue
        : encodeURIComponent(JSON.stringify(cookieValue));
    this[RES_COOKIE][cookieName] = createSetCookieValue(cookieName, resolvedValue, options);
  }

  append(
    cookieName: string,
    cookieValue: string | number | Record<string, any>,
    options: CookieOptions = {}
  ) {
    this[LIVE_COOKIE][cookieName] =
      typeof cookieValue === 'string' ? cookieValue : JSON.stringify(cookieValue);

    const resolvedValue =
      typeof cookieValue === 'string'
        ? cookieValue
        : encodeURIComponent(JSON.stringify(cookieValue));
    this[RES_COOKIE][++this.appendCounter] = createSetCookieValue(
      cookieName,
      resolvedValue,
      options
    );
  }

  delete(name: string, options?: Pick<CookieOptions, 'path' | 'domain' | 'sameSite'>) {
    this.set(name, 'deleted', { ...options, maxAge: 0 });
    this[LIVE_COOKIE][name] = null;
  }

  headers() {
    return Object.values(this[RES_COOKIE]);
  }
}

/** @public */
export const mergeHeadersCookies = (headers: Headers, cookies: CookieInterface) => {
  const cookieHeaders = cookies.headers();
  if (cookieHeaders.length > 0) {
    const newHeaders = new Headers(headers);
    for (const cookie of cookieHeaders) {
      newHeaders.append('Set-Cookie', cookie);
    }
    return newHeaders;
  }
  return headers;
};

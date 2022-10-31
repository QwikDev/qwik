import type {
  Cookie as CookieInterface,
  CookieOptions,
} from '../../middleware/request-handler/types';

const SAMESITE = {
  lax: 'Lax',
  none: 'None',
  strict: 'Strict',
} as const;

const UNIT = {
  seconds: 1,
  minutes: 1 * 60,
  hours: 1 * 60 * 60,
  days: 1 * 60 * 60 * 24,
  weeks: 1 * 60 * 60 * 24 * 7,
};

const createCookie = (cookieName: string, cookieValue: string, options: CookieOptions) => {
  const c: string[] = [`${cookieName}=${cookieValue}`];

  if (options.domain) {
    c.push(`Domain=${options.domain}`);
  }

  if (options.expires) {
    const resolvedValue =
      typeof options.expires === 'number' || typeof options.expires == 'string'
        ? options.expires
        : options.expires.toUTCString();
    c.push(`Expires=${resolvedValue}`);
    1;
  }

  if (options.httpOnly) {
    c.push('HttpOnly');
  }

  if (options.maxAge) {
    const resolvedValue =
      typeof options.maxAge === 'number'
        ? options.maxAge
        : options.maxAge[0] * UNIT[options.maxAge[1]];
    c.push(`MaxAge=${resolvedValue}`);
  }

  if (options.path) {
    c.push(`Path=${options.path}`);
  }

  if (options.sameSite) {
    c.push(`SameSite=${SAMESITE[options.sameSite]}`);
  }

  if (options.secure) {
    c.push('Secure');
  }

  return c.join('; ');
};

const parseCookieString = (cookieString: string | undefined | null) => {
  const cookie: Record<string, string> = {};
  if (typeof cookieString === 'string' && cookieString !== '') {
    const cookies = cookieString.split(';');
    for (const cookieSegment of cookies) {
      const cookieSplit = cookieSegment.split('=');
      const cookieName = decodeURIComponent(cookieSplit[0].trim());
      const cookieValue = decodeURIComponent(cookieSplit[1].trim());
      cookie[cookieName] = cookieValue;
    }
  }
  return cookie;
};

const COOKIES = Symbol('cookies');
const HEADERS = Symbol('headers');

export class Cookie implements CookieInterface {
  private [COOKIES]: Record<string, string>;
  private [HEADERS]: Record<string, string> = {};

  constructor(cookieString?: string | undefined | null) {
    this[COOKIES] = parseCookieString(cookieString);
  }

  get(cookieName: string) {
    const value = this[COOKIES][cookieName];
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

  set(
    cookieName: string,
    cookieValue: string | number | Record<string, any>,
    options: CookieOptions = {}
  ) {
    const resolvedValue =
      typeof cookieValue === 'string'
        ? cookieValue
        : encodeURIComponent(JSON.stringify(cookieValue));
    this[HEADERS][cookieName] = createCookie(cookieName, resolvedValue, options);
  }

  has(cookieName: string) {
    return !!this[COOKIES][cookieName];
  }

  delete(name: string) {
    this.set(name, 'deleted', { expires: new Date(0) });
  }

  *headers(): IterableIterator<string> {
    for (const header of Object.values(this[HEADERS])) {
      yield header;
    }
  }
}

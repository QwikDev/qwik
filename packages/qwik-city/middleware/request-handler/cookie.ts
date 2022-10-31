/**
 * @alpha
 */
export interface CookieOptions {
  domain?: string;
  expires?: Date | string;
  httpOnly?: boolean;
  maxAge?: number | [number, keyof typeof UNIT];
  path?: string;
  sameSite?: keyof typeof SAMESITE;
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

const handleOptions = (options: CookieOptions): string[] => {
  const opts: string[] = [];

  if (options.domain) {
    opts.push(`Domain=${options.domain}`);
  }

  if (options.expires) {
    const resolvedValue =
      typeof options.expires === 'number' || typeof options.expires == 'string'
        ? options.expires
        : options.expires.toUTCString();
    opts.push(`Expires=${resolvedValue}`);
    1;
  }

  if (options.httpOnly) {
    opts.push('HttpOnly');
  }

  if (options.maxAge) {
    const resolvedValue =
      typeof options.maxAge === 'number'
        ? options.maxAge
        : options.maxAge[0] * UNIT[options.maxAge[1]];
    opts.push(`MaxAge=${resolvedValue}`);
  }

  if (options.path) {
    opts.push(`Path=${options.path}`);
  }

  if (options.sameSite) {
    opts.push(`SameSite=${SAMESITE[options.sameSite]}`);
  }

  if (options.secure) {
    opts.push('Secure');
  }

  return opts;
};

const createCookie = (name: string, value: string, options: CookieOptions = {}) => {
  return [`${name}=${value}`, ...handleOptions(options)].join('; ');
};

const parseCookieString = (cookieString: string) => {
  if (cookieString === '') {
    return {};
  }
  return cookieString.split(';').reduce((prev: Record<string, string>, cookie_value) => {
    const split = cookie_value.split('=');
    prev[decodeURIComponent(split[0].trim())] = decodeURIComponent(split[1].trim());
    return prev;
  }, {});
};

export class Cookie {
  private _cookie: Record<string, string>;
  private _headers: Record<string, string> = {};

  constructor(cookieString: string) {
    const parsedCookie: Record<string, string> = parseCookieString(cookieString);
    this._cookie = parsedCookie;
  }

  get(name: string): CookieValue | null {
    const value = this._cookie[name];
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

  set(name: string, value: string | number | Record<string, any>, options: CookieOptions = {}) {
    const resolvedValue =
      typeof value === 'string' ? value : encodeURIComponent(JSON.stringify(value));
    this._headers[name] = createCookie(name, resolvedValue, options);
  }

  has(name: string) {
    return !!this._cookie[name];
  }

  delete(name: string) {
    this.set(name, 'deleted', { expires: new Date(0) });
  }

  *headers(): IterableIterator<string> {
    for (const header of Object.values(this._headers)) {
      yield header;
    }
  }
}

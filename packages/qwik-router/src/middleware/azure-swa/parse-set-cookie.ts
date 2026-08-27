// Minimal inlined replacement for `set-cookie-parser`'s parseString.

export interface ParsedSetCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: Date;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
}

export function parseSetCookieString(setCookieHeader: string): ParsedSetCookie {
  const [nameValuePair, ...attributeParts] = setCookieHeader.split(';');
  const equalsIndex = nameValuePair.indexOf('=');
  const cookie: ParsedSetCookie = {
    name: nameValuePair.slice(0, equalsIndex).trim(),
    value: tryDecode(nameValuePair.slice(equalsIndex + 1).trim()),
  };
  for (const part of attributeParts) {
    const attrEqualsIndex = part.indexOf('=');
    const key = (attrEqualsIndex === -1 ? part : part.slice(0, attrEqualsIndex))
      .trim()
      .toLowerCase();
    const value = attrEqualsIndex === -1 ? '' : part.slice(attrEqualsIndex + 1).trim();
    if (key === 'domain') {
      cookie.domain = value;
    } else if (key === 'path') {
      cookie.path = value;
    } else if (key === 'expires') {
      cookie.expires = new Date(value);
    } else if (key === 'max-age') {
      cookie.maxAge = parseInt(value, 10);
    } else if (key === 'secure') {
      cookie.secure = true;
    } else if (key === 'httponly') {
      cookie.httpOnly = true;
    } else if (key === 'samesite') {
      cookie.sameSite = value;
    }
  }
  return cookie;
}

function tryDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

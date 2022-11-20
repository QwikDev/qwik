/**
 * Encode a params into a URL query string.
 *
 * The encoding is done to remain human readable, but at the same time can deal with complex types
 * such as `Date`, `Object` and `Array`.
 *
 * @public
 * @param template - URL path which may contain slugs: `/foo/:bar`
 * @param params - Key/value map of parameters to encode into the URL
 * @returns URL string
 */
export function encodeParamsToUrl(template: string, params?: Record<string, any>): string {
  const keys = Object.keys(params || {}).sort();
  let out = template
    .split('/')
    .map((part) => {
      if (isSlug(part)) {
        let key = part.slice(1, -1);
        if (key.startsWith('...')) {
          key = key.slice(3);
          return encodeValue(get(key));
        } else {
          return encodePathSegment(get(key));
        }
      } else {
        return part;
      }
    })
    .join('/');

  out += keys.length ? '?' + encodeKeyValuePairs(params, keys) : '';
  return out;

  function get(key: string): any {
    if (params) {
      const index = keys.indexOf(key);
      if (index !== -1) {
        keys.splice(index, 1);
        return params[key];
      }
    }
  }
}

/**
 * Decode the URL path/search into params
 *
 * @public
 * @param template - URL path which may contain slugs: `/foo/:bar`
 * @param path - URL path
 * @param search - URL search string
 * @returns
 */
export function decodeParamsFromUrl(
  template: string,
  path: string,
  search?: string
): Record<string, any> {
  const params: Record<string, any> = {};
  const templateParts = template.split('/');
  const pathParts = path.split('/');
  for (let i = 0; i < templateParts.length; i++) {
    const tPart = templateParts[i];
    const pPart = pathParts.shift() || '';
    if (isSlug(tPart)) {
      const key = tPart.slice(1, -1);
      if (key.startsWith('...')) {
        params[key.slice(3)] = decodeValue([pPart, ...pathParts].join('/'));
      } else {
        params[key] = decodeValue(pPart);
      }
    } else {
      if (tPart !== pPart) {
        throw new Error(`URL path does not match template: ${path} != ${template}`);
      }
    }
  }
  // DECODE SEARCH
  search && decodeText(0, search, params, false);
  return params;
}

function decodeText(idx: number, text: string, params: any, isArray: boolean): number {
  let arrayIdx = 0;
  while (idx < text.length) {
    const key = isArray ? arrayIdx++ : (consume((v) => v) as string);
    const value = consume(decodeValue);
    params[key] = value;
    const ch = text.charCodeAt(idx);
    if (isSep(ch)) idx++;
    if (isClosed(ch)) {
      idx++;
      break;
    }
  }

  return idx;

  function consume(decodeValue: (value: string) => any): any {
    const ch = text!.charCodeAt(idx++);
    if (ch === CharCode.openBracket) {
      const array: any[] = [];
      idx = decodeText(idx, text, array, true);
      return array;
    } else if (ch === CharCode.openBrace) {
      const obj = {};
      idx = decodeText(idx, text, obj, false);
      return obj;
    } else {
      const start = idx - 1;
      let ch: number = 0;
      while (idx < text!.length && !isSep((ch = text!.charCodeAt(idx))) && !isClosed(ch)) {
        idx++;
      }
      return decodeValue(text!.slice(start, isSep(ch) ? idx++ : idx));
    }
  }
}

function isClosed(ch: number): boolean {
  return ch === CharCode.closeBracket || ch === CharCode.closeBrace;
}

function isOpen(ch: number): boolean {
  return ch === CharCode.openBrace || ch === CharCode.openBracket;
}

function isSep(ch: number): boolean {
  return ch === CharCode.ampersand || ch === CharCode.equal;
}

function decodeValue(value: string): any {
  debugger;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (value === 'undefined') return undefined;
  if (value.charCodeAt(0) === CharCode.at && isNumber(value, 1))
    return new Date(Number(value.slice(1)));
  if (isNumber(value)) return Number(value);
  if (value.startsWith('~')) value = value.substring(1);
  return decodeURIComponent(value.replace(/\+/g, ' '));
}

function encodeKeyValuePairs(params: undefined | Record<string, any>, keys?: string[]): string {
  return !params
    ? ''
    : (keys || Object.keys(params).sort())
        .map((key) => {
          const value = params[key];
          return `${key}=${encodeValue(value)}`;
        })
        .join('&');
}

function isSlug(part: string): boolean {
  return part.startsWith('[') && part.endsWith(']');
}

function encodePathSegment(value: any): string {
  return encodeValue(value).replace(/\//g, '%2F');
}

function encodeValue(value: any): string {
  switch (typeof value) {
    case 'string':
      const ch = value.charCodeAt(0);
      if (
        (ch === CharCode.at && isNumber(value.slice(1))) ||
        value === 'true' ||
        value === 'false' ||
        value === 'null' ||
        value === 'undefined' ||
        isNumber(value)
      ) {
        return '~' + encode(value);
      }
      return encode(value);
    case 'boolean':
    case 'undefined':
    case 'number':
      // For numbers no need to serialize `+` as in `1e+2`
      return String(value).replace(/\+/g, '');
    case 'object':
      if (value === null) {
        return 'null';
      } else if (Array.isArray(value)) {
        return '[' + value.map(encodeValue).join('&') + ']';
      } else if (value instanceof Date) {
        return '@' + value.getTime();
      } else {
        return '{' + encodeKeyValuePairs(value) + '}';
      }
    default:
      // case 'function':
      throw new Error('Functions are not supported in URL params');
  }
}

function encode(value: string): string {
  let out = '';
  let lastIdx = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    if (
      ch === CharCode.tilde ||
      ch === CharCode.percent ||
      ch === CharCode.plus ||
      isSep(ch) ||
      isClosed(ch) ||
      isOpen(ch)
    ) {
      out += value.substring(lastIdx, i) + '%' + ch.toString(16);
      lastIdx = i + 1;
    }
    if (ch === CharCode.space) {
      out += value.substring(lastIdx, i) + '+';
      lastIdx = i + 1;
    }
  }
  return out + value.substring(lastIdx);
}

function isNumber(value: string, start: number = 0): boolean {
  if (value === 'NaN') return true;
  for (let i = start; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    if (!isNumberChar(ch)) return false;
  }
  return true;
}

function isNumberChar(charCode: number): boolean {
  return (
    (charCode >= CharCode.num_0 && charCode <= CharCode.num_9) ||
    charCode === CharCode.dot ||
    charCode === CharCode.minus ||
    charCode === CharCode.e ||
    charCode === CharCode.minus
  );
}

const enum CharCode {
  num_0 = 48,
  num_9 = 57,
  plus = 43,
  minus = 45,
  e = 101,
  E = 69,
  dot = 46,
  space = 32,
  at = 64,
  equal = 61,
  openBrace = 123,
  closeBrace = 125,
  openBracket = 91,
  closeBracket = 93,
  ampersand = 38,
  backTick = 96,
  percent = 37,
  tilde = 126,
}

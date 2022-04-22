import { QError, qError } from '../error/error';

export function assertValidDataKey(key: string | null) {
  if (!key) return;
  for (let i = 0; i < key.length; i++) {
    const ch = key.charCodeAt(i);
    if (!isAlphanumeric(ch)) {
      throw qError(QError.Entity_notValidKey_key, key);
    }
  }
}

function isAlphanumeric(ch: number) {
  return (
    (CharCode.A <= ch && ch <= CharCode.Z) ||
    isAlphanumericAttribute(ch) ||
    ch == CharCode.DOT ||
    ch == CharCode.COLON
  );
}

function isAlphanumericAttribute(ch: number) {
  return (
    (CharCode.a <= ch && ch <= CharCode.z) ||
    (CharCode._0 <= ch && ch <= CharCode._9) ||
    ch == CharCode.DASH ||
    ch == CharCode.UNDERSCORE
  );
}

export function isValidAttribute(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (!isAlphanumericAttribute(ch)) return false;
  }
  return true;
}

export const enum CharCode {
  _0 = 48, // "0"
  _9 = 57, // "9"
  COLON = 58, // ":"
  DASH = 45, // "-"
  UNDERSCORE = 95, // "_"
  DOT = 46, // "."
  A = 65, // "A"
  Z = 90, // "A"
  a = 97, // "a"
  z = 122, // "z"
}

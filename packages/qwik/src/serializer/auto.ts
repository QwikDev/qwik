import {
  _fastSkipSerialize as fastSkipSerialize,
  _isStore as isStore,
  SerializerSymbol,
} from '@qwik.dev/core/internal';

const MAX_BYTES = 1024;
const MAX_VALUES = 64;
const MAX_DEPTH = 8;
const MAX_BIGINT = 1n << 256n;

/** Classifies bounded plain values without getters or custom serializers. */
export function getAutoSerializationMode(value: unknown): 'retain' | 'reuse' | 'omit' {
  let bytes = MAX_BYTES;
  let values = MAX_VALUES;
  const seen = new Set<object>();

  const countString = (text: string) => {
    if (text.length > bytes) {
      bytes = -1;
      return;
    }
    bytes -= 8;
    for (let i = 0; i < text.length && bytes >= 0; i++) {
      const code = text.charCodeAt(i);
      if (code < 32 || code === 60) {
        bytes -= 6;
      } else if (code === 34 || code === 92) {
        bytes -= 2;
      } else if (code < 128) {
        bytes--;
      } else {
        bytes -= code < 2048 ? 2 : 3;
      }
    }
  };

  const visit = (entry: unknown, depth: number): boolean => {
    if (--values < 0 || depth > MAX_DEPTH) {
      return false;
    }
    if (fastSkipSerialize(entry)) {
      return true;
    }
    if (entry === null || entry === undefined || typeof entry === 'boolean') {
      bytes -= 8;
    } else if (typeof entry === 'number') {
      bytes -= 32;
    } else if (typeof entry === 'bigint') {
      if (entry >= MAX_BIGINT || entry <= -MAX_BIGINT) {
        bytes = -1;
      }
      bytes -= 88;
    } else if (typeof entry === 'string') {
      countString(entry);
    } else if (typeof entry === 'object') {
      if (seen.has(entry)) {
        bytes -= 8;
        return true;
      }
      const prototype = Object.getPrototypeOf(entry);
      const isArray = Array.isArray(entry);
      if (
        isStore(entry) ||
        SerializerSymbol in entry ||
        (isArray
          ? prototype !== Array.prototype
          : prototype !== Object.prototype && prototype !== null)
      ) {
        return false;
      }
      seen.add(entry);
      bytes -= 8;
      if (isArray) {
        const length = Object.getOwnPropertyDescriptor(entry, 'length')!.value as number;
        if (length > values) {
          return false;
        }
        for (let i = 0; i < length; i++) {
          const descriptor = Object.getOwnPropertyDescriptor(entry, i);
          if ((descriptor && !('value' in descriptor)) || !visit(descriptor?.value, depth + 1)) {
            return false;
          }
        }
      } else {
        for (const key in entry) {
          const descriptor = Object.getOwnPropertyDescriptor(entry, key);
          if (!descriptor) {
            continue;
          }
          if (key === '__proto__' || !('value' in descriptor)) {
            return false;
          }
          countString(key);
          if (!visit(descriptor.value, depth + 1)) {
            return false;
          }
        }
      }
    } else {
      return false;
    }
    return true;
  };

  if (!visit(value, 0)) {
    return 'omit';
  }
  return bytes >= 0 ? 'retain' : 'reuse';
}

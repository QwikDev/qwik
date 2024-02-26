// pack bytes into valid UTF-16 string
//
// strategy:
//
// * using 0x007f as the escape character
//  * if there is esc in the bytes replace it with 0x007f 0x08ff
// * if there is unmatched surrogate pair, mark it by the escape character
//
// In a UTF-16 string, "high surrogate" values 0xD800-0xDBFF must be followed by
// "low surrogate" values 0xDC00-0xDFFF. If this is not the case we must replace
// the mismatched high or low surrogate with an escaped value.
//
// 0x007f: escape, because it's rare but still only one utf-8 byte.
//   To escape itself, use 0x007f 0x08ff (two bytes utf-8)
// 0x0000->0x001f: converted to esc + 0x0020->0x003f (two bytes utf-8)
// unmatched pairs: converted to esc + (code-0xd800+0x0040) 0x0040->0x083f
//   (two-four bytes utf-8)
// BOM: esc + 0x08fe (four bytes utf-8)
//
// If the length of the bytes is odd, the last byte XX is put before the escape
// character as 0x00XX ESC.
//
const ESC = 0x007f;
const SURROGATE_OFFSET = 0xd800 - 0x0040;
export const packUint8Array = (bytes: Uint8Array) => {
  let code = '';
  let surrogate: number | undefined;
  let low = true;
  let c = 0;
  for (const b of bytes) {
    if (low) {
      c = b;
      low = false;
      continue;
    }
    c |= b << 8;
    low = true;
    if (surrogate !== undefined) {
      if (c >= 0xdc00 && c <= 0xdfff) {
        // valid surrogate pair
        code += String.fromCharCode(surrogate, c);
        surrogate = undefined;
        continue;
      } else {
        // surrogate was unmatched high surrogate, so escape it
        code += String.fromCharCode(ESC, surrogate - SURROGATE_OFFSET);
        surrogate = undefined;
      }
    }
    if (c >= 0xd800 && c <= 0xdbff) {
      surrogate = c;
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) {
      // unmatched low surrogate
      code += String.fromCharCode(ESC, c - SURROGATE_OFFSET);
      continue;
    }
    // escape the BOM
    if (c === 0xfeff) {
      code += String.fromCharCode(ESC, 0x08fe);
      continue;
    }
    // escape control character range to keep JSON short
    if (c <= 0x001f) {
      code += String.fromCharCode(ESC, c + 0x0020);
      continue;
    }
    if (c === ESC) {
      code += String.fromCharCode(0x08ff);
      continue;
    }
    // normal codepoint
    code += String.fromCharCode(c);
  }
  if (surrogate) {
    // ended with unmatched high surrogate
    const x = surrogate - SURROGATE_OFFSET;
    code += String.fromCharCode(ESC, x === ESC ? 0x08fd : x);
  }
  if (!low && bytes.length > 0) {
    // put the last byte
    code += String.fromCharCode(c, ESC);
  }
  return code;
};

// unpack encoded valid UTF-16 string into Uint8Array
export const unpackUint8Array = (code: string) => {
  const odd = code.charCodeAt(code.length - 1) === ESC;
  const bytes = new Uint8Array(code.length * 2);
  let j = 0;
  let escaped = false;
  for (const s of code) {
    const c = s.charCodeAt(0);
    if (!escaped) {
      if (c === ESC) {
        escaped = true;
      } else {
        bytes[j++] = c & 0xff;
        bytes[j++] = c >>> 8;
        // check if s is surrogate pair
        if (c >= 0xd800 && c <= 0xdbff) {
          const d = s.charCodeAt(1);
          bytes[j++] = d & 0xff;
          bytes[j++] = d >>> 8;
        }
      }
      continue;
    }
    // escaped character
    if (c < 0x0040) {
      // restore the control characters
      bytes[j++] = (c - 0x0020) & 0xff;
      bytes[j++] = c >>> 8;
    } else if (c <= 0xdfff - SURROGATE_OFFSET) {
      const x = c + SURROGATE_OFFSET;
      bytes[j++] = x & 0xff;
      bytes[j++] = x >>> 8;
    } else if (c === 0x08fd) {
      // restore the 0xd83f collided with ESC ESC at the end of even array
      bytes[j++] = 0x3f;
      bytes[j++] = 0xd8;
    } else if (c === 0x08fe) {
      // restore the BOM
      bytes[j++] = 0xff;
      bytes[j++] = 0xfe;
    } else {
      // restore the escape character
      bytes[j++] = ESC;
      j++; // skip the high byte
    }
    escaped = false;
  }
  if (odd && !escaped) {
    // the last 2 bytes was 0x007f 0x007f and unescaped as 0xd83f,
    // so revert it as 0x007f.
    // because of the `for...of` has no index, it is needed to do here
    j -= 2;
    bytes[j++] = ESC;
  }
  // if ended while escaped, the length is odd
  if (escaped) {
    // Array is odd-length, remove last byte
    return bytes.subarray(0, j - 1);
  } else {
    return bytes.subarray(0, j);
  }
};

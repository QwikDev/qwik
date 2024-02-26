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
  const odd = bytes.length % 2 === 1;
  const length = bytes.length - (odd ? 1 : 0);
  let code = '';
  let surrogate = false;
  for (let i = 0; i < length; i += 2) {
    const c = (bytes[i + 1] << 8) | bytes[i];
    // test high surrogate
    if (c >= 0xd800 && c <= 0xdbff) {
      if (surrogate) {
        // unmatched high surrogate
        // omit the MSB to make it a normal codepoint
        const prev = (bytes[i - 1] << 8) | bytes[i - 2];
        code += String.fromCharCode(ESC, prev - SURROGATE_OFFSET);
      }
      surrogate = true;
      continue;
    }
    // test low surrogate
    if (c >= 0xdc00 && c <= 0xdfff) {
      if (surrogate) {
        // valid surrogate pair
        const prev = (bytes[i - 1] << 8) | bytes[i - 2];
        code += String.fromCharCode(prev, c);
        surrogate = false;
        continue;
      }
      // unmatched low surrogate
      // omit the MSB to make it a normal codepoint
      const x = c - SURROGATE_OFFSET;
      code += String.fromCharCode(ESC, x);
      continue;
    }
    if (surrogate) {
      // no low surrogate after high surrogate
      // omit the MSB to make it a normal codepoint
      const prev = (bytes[i - 1] << 8) | bytes[i - 2];
      const x = prev - SURROGATE_OFFSET;
      code += String.fromCharCode(ESC, x === ESC ? 0x08fd : x);
      surrogate = false; // reset surrogate
    }
    // escape the BOM
    if (c === 0xfeff) {
      // BOM
      code += String.fromCharCode(ESC, 0x08fe);
      continue;
    }
    // escape control character range to keep JSON short
    if (c <= 0x001f) {
      code += String.fromCharCode(ESC, c + 0x0020);
      continue;
    }
    // double the escape character
    if (c === ESC) {
      code += String.fromCharCode(0x08ff);
    }
    // normal codepoint
    code += String.fromCharCode(c);
  }
  if (surrogate) {
    // ended with unmatched high surrogate
    // subtract the offset to make it a normal codepoint
    const c = (bytes[length - 1] << 8) | bytes[length - 2];
    const x = c - SURROGATE_OFFSET;
    code += String.fromCharCode(ESC, x === ESC ? 0x08fd : x);
  }
  if (odd) {
    // put the last byte
    code += String.fromCharCode(bytes[bytes.length - 1], ESC);
  }
  return code;
};

// unpack encoded valid UTF-16 string into Uint8Array
export const unpackUint8Array = (code: string) => {
  const odd = code.charCodeAt(code.length - 1) === ESC;
  const bytes = new Uint8Array(code.length * 2);
  let j = 0;
  for (let i = 0; i < code.length; i++) {
    const c = code.charCodeAt(i);
    // check the escape character
    if (c !== ESC) {
      // normal codepoint
      bytes[j++] = c & 0xff;
      bytes[j++] = c >>> 8;
      continue;
    }
    // dealing with the escaped character
    if (i === code.length - 1) {
      break; // nothing to do with the last ESC
    }
    const e = code.charCodeAt(++i);
    if (odd && e === ESC) {
      // if the ESC ESC at the end, it's the last byte
      if (i === code.length - 1) {
        bytes[j++] = e; // put the last byte (equals to ESC)
        j++; // put ESC virtually, it will be omitted
        break;
      }
    }
    if (e === 0x08ff) {
      bytes[j++] = ESC; // unescape the escape character
      j++; // skip the high byte
      continue;
    }
    if (e === 0x08fe) {
      // restore the BOM
      bytes[j++] = 0xff;
      bytes[j++] = 0xfe;
    } else if (e === 0x08fd) {
      // restore the 0xd83f (collided with ESC ESC)
      bytes[j++] = 0x3f;
      bytes[j++] = 0xd8;
    } else if (e >= 0x0020 && e <= 0x003f) {
      // restore the control characters
      bytes[j++] = (e - 0x0020) & 0xff;
      bytes[j++] = e >>> 8;
    } else {
      // restore the unmatched surrogates
      const x = e + SURROGATE_OFFSET;
      bytes[j++] = x & 0xff;
      bytes[j++] = x >>> 8;
    }
  }
  if (odd) {
    j--; // omit the last ESC
  }
  return bytes.subarray(0, j);
};

// pack bytes into valid UTF-16 string
//
// strategy:
//
// * using 0x007f as the escape character
//  * if there is esc in the bytes replace it with 0x007f 0x08ff
// * if there is unmatched surrogate pair, mark it by the escape character
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
  const dbytes = new Uint16Array(bytes.buffer, 0, bytes.length >> 1);
  let code = '';
  let surrogate = false;
  for (let i = 0; i < dbytes.length; i++) {
    const c = dbytes[i];
    // test high surrogate
    if (c >= 0xd800 && c <= 0xdbff) {
      if (surrogate) {
        // unmatched high surrogate
        // omit the MSB to make it a normal codepoint
        const prev = dbytes[i - 1];
        code += String.fromCharCode(ESC, prev - SURROGATE_OFFSET);
      }
      surrogate = true;
      continue;
    }
    // test low surrogate
    if (c >= 0xdc00 && c <= 0xdfff) {
      if (surrogate) {
        // valid surrogate pair
        code += String.fromCharCode(dbytes[i - 1], c);
        surrogate = false;
        continue;
      }
      // unmatched low surrogate
      // omit the MSB to make it a normal codepoint
      code += String.fromCharCode(ESC, c - SURROGATE_OFFSET);
      continue;
    }
    if (surrogate) {
      // no low surrogate after high surrogate
      // omit the MSB to make it a normal codepoint
      const prev = dbytes[i - 1];
      code += String.fromCharCode(ESC, prev - SURROGATE_OFFSET);
      surrogate = false; // reset surrogate
    }
    // escape the BOM
    if (c === 0xfeff) {
      // BOM
      code += String.fromCharCode(ESC, 0x08fe);
      continue;
    }
    // extra comaction againt the strinfigy of the control characters
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
    const c = dbytes[dbytes.length - 1];
    code += String.fromCharCode(ESC, c - SURROGATE_OFFSET);
  }
  if (odd) {
    // put the last byte
    code += String.fromCharCode(bytes[bytes.length - 1], ESC);
  }
  return code;
};

// unpack encoded valid UTF-16 string into Uint8Array
export const unpackUint8Array = (code: string) => {
  const dbytes = new Uint16Array(code.length);
  const odd = code.charCodeAt(code.length - 1) === ESC;
  let j = 0;
  for (let i = 0; i < code.length; i++) {
    const c = code.charCodeAt(i);
    // check the escape character
    if (c !== ESC) {
      // normal codepoint
      dbytes[j++] = c;
      continue;
    }
    // escaped character
    const e = code.charCodeAt(++i);
    if (odd && e === ESC) {
      // if the ESC ESC at the end, it's the last byte
      if (i === code.length - 1) {
        dbytes[j++] = c; // put the last byte (equals to ESC)
        j++; // put ESC virtually, it will be omitted
        break;
      }
    }
    if (e === 0x08ff) {
      dbytes[j++] = ESC; // unescape the escape character
      continue;
    }
    if (e === 0x08fe) {
      // restore the BOM
      dbytes[j++] = 0xfeff;
    } else if (e >= 0x0020 && e <= 0x003f) {
      // restore the control characters
      dbytes[j++] = e - 0x0020;
    } else {
      // restore the unmatched surrogates
      dbytes[j++] = e + SURROGATE_OFFSET;
    }
  }
  if (odd) {
    j--; // omit the last ESC
  }
  const length = j * 2 - (odd ? 1 : 0);
  return new Uint8Array(dbytes.subarray(0, j).buffer).subarray(0, length);
};

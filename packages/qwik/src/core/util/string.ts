// pack bytes into valid UTF-16 string
//
// strategy:
//
// * using 0xFFFD as the escape character
//  * if there is 0xFFFD in the bytes, double it
// * if there is unmatched surrogate pair, mark it by the escape character
// * and omit the MSB to make it normal code point.
//  * high surrogates 0xD800-0xDBFF -> 0x5800-0x5BFF
//  * low surrogates 0xDC00-0xDFFF -> 0x5C00-0x5FFF
//
// If the length of the bytes is odd, the last byte is put after the escape
// character. As the bytes after the escape character are in 0x5800 to 0x5FFF,
// we can distinguish the last byte by its high byte being 0x00.
//
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
        code += String.fromCharCode(0xfffd, prev & 0x7fff);
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
      code += String.fromCharCode(0xfffd, c & 0x7fff);
      continue;
    }
    if (surrogate) {
      // no low surrogate after high surrogate
      // omit the MSB to make it a normal codepoint
      const prev = dbytes[i - 1];
      code += String.fromCharCode(0xfffd, prev & 0x7fff);
      surrogate = false; // reset surrogate
    }
    // escape the BOM
    if (c === 0xfeff) {
      // BOM
      code += String.fromCharCode(0xfffd, 0xffff);
      continue;
    }
    // double the escape character
    if (c === 0xfffd) {
      code += String.fromCharCode(0xfffd);
    }
    // normal codepoint
    code += String.fromCharCode(c);
  }
  if (surrogate) {
    // ended with unmatched high surrogate
    // omit the MSB to make it a normal codepoint
    const c = dbytes[dbytes.length - 1];
    code += String.fromCharCode(0xfffd, c & 0x7fff);
  }
  if (odd) {
    // put the last byte
    code += String.fromCharCode(0xfffd, bytes[bytes.length - 1]);
  }
  return code;
};

// unpack encoded valid UTF-16 string into Uint8Array
export const unpackUint8Array = (code: string) => {
  const dbytes = new Uint16Array(code.length);
  let j = 0;
  let odd = false;
  for (let i = 0; i < code.length; i++) {
    const c = code.charCodeAt(i);
    // check the escape character
    if (c !== 0xfffd) {
      // normal codepoint
      dbytes[j++] = c;
      continue;
    }
    // escaped character
    const e = code.charCodeAt(++i);
    if (e === 0xfffd) {
      dbytes[j++] = 0xfffd; // unescape the escape character
      continue;
    }
    // test the last byte
    if ((e & 0xff00) === 0) {
      dbytes[j++] = e;
      odd = true;
      break;
    }
    if (e === 0xffff) {
      // restore the BOM
      dbytes[j++] = 0xfeff;
    } else {
      // restore the MSB
      dbytes[j++] = e | 0x8000;
    }
  }
  const length = j * 2 - (odd ? 1 : 0);
  return new Uint8Array(dbytes.subarray(0, j).buffer).subarray(0, length);
};

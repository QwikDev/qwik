'./string.unit.ts';
// pack bytes into valid UTF-16 string
//
// strategy:
//
// * using 0xFFFD as the escape character
//  * if there is 0xFFFD in the bytes, double it
// * if there is unmatched surrogate pair, mark it by the escape character
// * and put a fake surrogate pair to make it valid
//  * 0xD800 for fake high surrogate to be with unmatched low surrogate
//  * 0xDC00 for fake low surrogate to be with unmatched high surrogate
//
// if the unmatched high surrogate is 0xD800, it is collided with the fake
// high surrogate, so use [0xD801, 0xDC01] as the fake surrogate pair
// representing the 0xD800.
//
// If the length of the bytes is odd, the last byte is put after the escape
// character. As the bytes after the escape character are in 0xD800 to 0xDFFF,
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
        const prev = dbytes[i - 1];
        const [hi, lo] = prev === 0xd800 ? [0xd801, 0xdc01] : [prev, 0xdc00];
        // put the 0xFFFD and the fake surrogate pair to make it valid
        code += String.fromCharCode(0xfffd, hi, lo);
        // keep surrogate is true because c is high surrogate
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
      // put the 0xFFFD and the fake high surrogate to make it valid
      code += String.fromCharCode(0xfffd, 0xd800, c);
      continue;
    }
    if (surrogate) {
      // no low surrogate after high surrogate
      const prev = dbytes[i - 1];
      const [hi, lo] = prev === 0xd800 ? [0xd801, 0xdc01] : [prev, 0xdc00];
      // put the 0xFFFD and the fake surrogate pair to make it valid
      code += String.fromCharCode(0xfffd, hi, lo);
      surrogate = false; // reset surrogate
    }
    // escape the BOM
    if (c === 0xfeff) {
      // BOM
      code += String.fromCharCode(0xfffd, 0xd801, 0xdc02);
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
    const c = dbytes[dbytes.length - 1];
    const [hi, lo] = c === 0xd800 ? [0xd801, 0xdc01] : [c, 0xdc00];
    code += String.fromCharCode(0xfffd, hi, lo);
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
  let escaped = false;
  for (let i = 0; i < code.length; i++) {
    const c = code.charCodeAt(i);
    // check the replacement character
    if (c === 0xfffd) {
      if (escaped) {
        dbytes[j++] = 0xfffd; // unescape the escape character
        escaped = false;
        continue;
      }
      escaped = true;
      continue;
    } else if (escaped && (c & 0xff00) === 0) {
      // test the last byte
      dbytes[j++] = c;
      break; // break with escaped being true to adjust the length
    }
    if (escaped && c >= 0xd800 && c <= 0xdbff) {
      escaped = false;
      // faked high surrogate
      if (c === 0xd800) {
        i++; // skip the fake high surrogate
        dbytes[j++] = code.charCodeAt(i); // save the low surrogate
      } else {
        if (c === 0xd801) {
          switch (code.charCodeAt(i + 1)) {
            case 0xdc00: // this is the fake low surrogate
              break;
            case 0xdc01:
              i++; // skip the fake low surrogate
              dbytes[j++] = 0xd800; // save the escaped 0xD800
              continue;
            case 0xdc02:
              i++; // skip the fake low surrogate
              dbytes[j++] = 0xfeff; // save the escaped BOM
              continue;
            default:
              continue;
          }
        }
        // escaped high surrogate
        dbytes[j++] = code.charCodeAt(i); // save the high surrogate
        i++; // skip the fake low surrogate
      }
      continue;
    }
    // normal codepoint
    dbytes[j++] = c;
  }
  // if ended while escaped, the length is odd
  const length = j * 2 - (escaped ? 1 : 0);
  return new Uint8Array(dbytes.subarray(0, j).buffer).subarray(0, length);
};

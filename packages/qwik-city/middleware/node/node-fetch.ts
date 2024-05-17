import {
  TextEncoderStream,
  TextDecoderStream,
  WritableStream,
  ReadableStream,
} from 'node:stream/web';
import { fetch, Headers, Request, Response, FormData } from 'undici';

import crypto from 'crypto';

// TODO: remove when undici is removed
export function patchGlobalThis() {
  if (
    typeof global !== 'undefined' &&
    typeof globalThis.fetch !== 'function' &&
    typeof process !== 'undefined' &&
    process.versions.node
  ) {
    globalThis.fetch = fetch as any;
    globalThis.Headers = Headers as any;
    globalThis.Request = Request as any;
    globalThis.Response = Response as any;
    globalThis.FormData = FormData as any;
  }
  if (typeof globalThis.TextEncoderStream === 'undefined') {
    // @ts-ignore
    globalThis.TextEncoderStream = TextEncoderStream;
    // @ts-ignore
    globalThis.TextDecoderStream = TextDecoderStream;
  }
  if (typeof globalThis.WritableStream === 'undefined') {
    globalThis.WritableStream = WritableStream as any;
    globalThis.ReadableStream = ReadableStream as any;
  }
  if (typeof globalThis.crypto === 'undefined') {
    globalThis.crypto = crypto.webcrypto as any;
  }
}

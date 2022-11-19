import fetch, { Headers, Request, Response } from 'node-fetch';

export function patchGlobalFetch() {
  if (
    typeof global !== 'undefined' &&
    typeof globalThis.fetch !== 'function' &&
    typeof process !== 'undefined' &&
    process.versions.node
  ) {
    if (!globalThis.fetch) {
      globalThis.fetch = fetch as any;
      globalThis.Headers = Headers as any;
      globalThis.Request = Request as any;
      globalThis.Response = Response as any;
    }
  }
}

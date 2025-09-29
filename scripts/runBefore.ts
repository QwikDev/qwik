function polyfill() {
  // @ts-ignore
  globalThis.qTest = true;
  // @ts-ignore
  globalThis.qRuntimeQrl = true;
  // @ts-ignore
  globalThis.qDev = true;
  // @ts-ignore
  globalThis.qInspector = false;
  if (
    typeof global !== 'undefined' &&
    typeof globalThis.fetch !== 'function' &&
    typeof process !== 'undefined' &&
    process.versions.node
  ) {
    if (!globalThis.fetch) {
      const { fetch, Headers, Request, Response, FormData } = require('undici');
      globalThis.fetch = fetch;
      globalThis.Headers = Headers;
      globalThis.Request = Request;
      globalThis.Response = Response;
      globalThis.FormData = FormData;
    }
  }
}

polyfill();

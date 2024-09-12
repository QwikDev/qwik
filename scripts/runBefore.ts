declare global {
  var qTest: boolean;
  var qRuntimeQrl: boolean;
  var qDev: boolean;
  var qInspector: boolean;
}

export function polyfill() {
  globalThis.qTest = true;
  globalThis.qRuntimeQrl = true;
  globalThis.qDev = true;
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

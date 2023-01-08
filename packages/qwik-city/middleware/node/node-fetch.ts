export async function patchGlobalFetch() {
  if (
    typeof global !== 'undefined' &&
    typeof globalThis.fetch !== 'function' &&
    typeof process !== 'undefined' &&
    process.versions.node
  ) {
    if (!globalThis.fetch) {
      const { fetch, Headers, Request, Response, FormData } = await import('undici');
      globalThis.fetch = fetch as any;
      globalThis.Headers = Headers as any;
      globalThis.Request = Request as any;
      globalThis.Response = Response as any;
      globalThis.FormData = FormData as any;
    }
  }
}

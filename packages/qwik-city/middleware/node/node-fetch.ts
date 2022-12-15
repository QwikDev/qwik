export async function patchGlobalFetch() {
  if (
    typeof global !== 'undefined' &&
    typeof globalThis.fetch !== 'function' &&
    typeof process !== 'undefined' &&
    process.versions.node
  ) {
    const { fetch, Headers, Request, Response, FormData } = await import('undici');
    if (!globalThis.fetch) {
      globalThis.fetch = fetch as any;
      globalThis.Headers = Headers as any;
      globalThis.Request = Request as any;
      globalThis.Response = Response as any;
      globalThis.FormData = FormData as any;
    }
  }
}

// pascal to snake case
export const toSnakeCase = (str: string) =>
  str
    .split(/\.?(?=[A-Z])/)
    .join('-')
    .toLowerCase();

export const setReplCorsHeaders = (headers: Headers) => {
  // Needed for SharedArrayBuffer in the REPL
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
};

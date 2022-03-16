export const normalizeUrl = (url: URL | string) =>
  typeof url === 'string' || url == null ? new URL(url || '/', 'https://qwik.dev') : url;

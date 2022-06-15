export const normalizePathname = (url: string) =>
  new URL(url || '/', 'https://qwik.builder.io').pathname;

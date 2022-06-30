export const normalizePathname = (url: string) =>
  new URL(url || '/', 'https://qwik.builder.io').pathname;

export const searchParamsToQuery = (searchParams: URLSearchParams) => {
  const obj: Record<string, string> = {};
  searchParams.forEach((value, key) => (obj[key] = value));
  return obj;
};

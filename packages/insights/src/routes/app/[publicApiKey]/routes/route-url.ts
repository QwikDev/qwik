export const getRouteDetailsHref = (publicApiKey: string, route: string): string =>
  `/app/${publicApiKey}/routes/${encodeURIComponent(route)}/`;

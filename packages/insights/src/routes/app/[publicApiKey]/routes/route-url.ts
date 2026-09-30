export const getRouteDetailsHref = (
  publicApiKey: string,
  route: string,
  manifestHash?: string
): string =>
  `/app/${publicApiKey}/routes/${encodeURIComponent(route)}/${manifestHash ? `?manifest=${encodeURIComponent(manifestHash)}` : ''}`;

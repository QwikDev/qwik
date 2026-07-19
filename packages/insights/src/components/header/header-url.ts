export const getSettingsHref = (publicApiKey: string | undefined): string | null =>
  publicApiKey ? `/app/${encodeURIComponent(publicApiKey)}/edit/` : null;

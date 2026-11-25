let iframeAppBase: string | undefined;

export function parseAppBase(base: string, origin: string): string {
  const parsed = new URL(base, origin);
  if (
    !base.startsWith('/') ||
    base.startsWith('//') ||
    base.includes('\\') ||
    parsed.origin !== origin ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== base
  ) {
    throw new Error('Invalid Qwik DevTools application base.');
  }
  return base.endsWith('/') ? base : `${base}/`;
}

export function initializeIframeAppBase(location: Location): void {
  const base = new URLSearchParams(location.search).get('base');
  if (!base) {
    throw new Error('Missing Qwik DevTools application base.');
  }
  initializeAppBase(base, location.origin);
}

export function initializeAppBase(base: string, origin: string): void {
  iframeAppBase = parseAppBase(base, origin);
}

export function getAppBase(): string {
  return iframeAppBase ?? import.meta.env.BASE_URL ?? '/';
}

/**
 * Utility timer function for performance profiling.
 * Returns a duration of 0 in environments that do not support performance.
 * @alpha
 */
export function createTimer() {
  if (typeof performance === 'undefined') {
    return () => 0;
  }
  const start = performance.now();
  return () => {
    const end = performance.now();
    const delta = end - start;
    return delta / 1000000;
  };
}

export function normalizeUrl(url: string | URL | undefined | null) {
  if (url != null) {
    if (typeof url === 'string') {
      return new URL(url || '/', BASE_URI);
    }
    if (typeof url.href === 'string') {
      return new URL(url.href || '/', BASE_URI);
    }
  }
  return new URL(BASE_URI);
}

const BASE_URI = `http://document.qwik.dev/`;

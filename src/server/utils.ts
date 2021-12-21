/**
 * Utility timer function for Nodejs performance profiling.
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

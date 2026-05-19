export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) {
    return '-';
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  if (ms >= 10) {
    return `${ms.toFixed(0)}ms`;
  }
  return `${ms.toFixed(2)}ms`;
}

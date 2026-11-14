export function getReportScope(
  manifests: { hash: string; timestamp: Date }[],
  query: URLSearchParams
) {
  const selectedHash = query.get('manifest') || manifests[0]?.hash || null;
  const selectedIndex = manifests.findIndex((manifest) => manifest.hash === selectedHash);
  const baseline = query.get('baseline');
  const previousHash =
    baseline === 'none' ? null : baseline || manifests[selectedIndex + 1]?.hash || null;
  const hasInvalidSelection =
    (selectedHash !== null && selectedIndex < 0) ||
    (previousHash !== null &&
      (!manifests.some((manifest) => manifest.hash === previousHash) ||
        previousHash === selectedHash));
  return {
    manifests: manifests.map((manifest) => ({
      ...manifest,
      timestamp: manifest.timestamp.toISOString(),
    })),
    selectedHash: hasInvalidSelection ? null : selectedHash,
    previousHash: hasInvalidSelection ? null : previousHash,
    problem: hasInvalidSelection
      ? 'The requested comparison is unavailable. Choose two different builds from this application’s recent manifest history.'
      : null,
  };
}

export function getReportHref(pathname: string, query: URLSearchParams): string {
  const scope = new URLSearchParams();
  for (const key of ['manifest', 'baseline']) {
    const value = query.get(key);
    if (value) {
      scope.set(key, value);
    }
  }
  return pathname + (scope.size ? `?${scope}` : '');
}

export function getReportQuery(
  query: URLSearchParams,
  scope: { selectedHash: string | null; previousHash: string | null }
): URLSearchParams {
  const resolved = new URLSearchParams(query);
  if (scope.selectedHash) {
    resolved.set('manifest', scope.selectedHash);
    resolved.set('baseline', scope.previousHash ?? 'none');
  }
  return resolved;
}

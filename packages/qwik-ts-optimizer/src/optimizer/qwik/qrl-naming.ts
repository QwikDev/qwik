export function plainQrlName(markerName: string): string {
  return markerName.slice(0, -1) + 'Qrl';
}

export function getQrlCalleeName(markerName: string): string {
  if (markerName === '$') return '';
  if (markerName === 'sync$') return '_qrlSync';
  return plainQrlName(markerName);
}

/**
 * A `$`-suffixed marker other than the bare `$`. Lib mode preserves these imports
 * so downstream consumers can re-import the markers; the bare `$` has no marker
 * semantics after extraction and is dropped.
 */
export function isLibModePreservedMarker(importedName: string): boolean {
  return importedName.length > 1 && importedName.endsWith('$');
}

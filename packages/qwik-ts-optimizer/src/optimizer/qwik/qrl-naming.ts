export function plainQrlName(markerName: string): string {
  return markerName.slice(0, -1) + 'Qrl';
}

/**
 * Map marker callees to their QRL wrapper names.
 */
export function getQrlCalleeName(markerName: string): string {
  if (markerName === '$') return '';
  if (markerName === 'sync$') return '_qrlSync';
  return plainQrlName(markerName);
}

/**
 * A `$`-suffixed marker name other than the bare `$` (`component$`,
 * `useStyle$`, …). Lib mode keeps these imports alongside their rewritten
 * `*Qrl` forms so downstream consumers can re-import the markers for
 * composition or re-export; the bare `$` has no marker-function semantics
 * after extraction and is still dropped.
 */
export function isLibModePreservedMarker(importedName: string): boolean {
  return importedName.length > 1 && importedName.endsWith('$');
}

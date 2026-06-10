/**
 * Map marker callees to their QRL wrapper names.
 */
export function getQrlCalleeName(markerName: string): string {
  if (markerName === '$') return '';
  if (markerName === 'sync$') return '_qrlSync';
  return markerName.slice(0, -1) + 'Qrl';
}

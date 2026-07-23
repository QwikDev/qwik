export function generateStrippedSegmentCode(symbolName: string): string {
  return `export const ${symbolName} = null;`;
}

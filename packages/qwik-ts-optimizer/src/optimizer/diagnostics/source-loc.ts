/**
 * Compute 1-based line and column from a character offset in source text.
 */
export function computeLineColFromOffset(
  source: string,
  offset: number,
): [number, number] {
  let line = 1;
  let col = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return [line, col];
}

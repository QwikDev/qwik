import type { SourceLocation } from '@qwik.dev/optimizer';

export function createSourceLocation(
  source: string,
  [lo, hi]: readonly [number, number]
): SourceLocation {
  const start = offsetLocation(source, lo);
  const end = offsetLocation(source, hi);
  return {
    lo,
    hi,
    startLine: start.line,
    startCol: start.column + 1,
    endLine: end.line,
    endCol: end.column,
  };
}

export function offsetLocation(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < offset && index < source.length; index++) {
    if (source.charCodeAt(index) === 10) {
      line++;
      lineStart = index + 1;
    }
  }
  return { line, column: offset - lineStart };
}

/** Source-range and source-map helpers shared by analysis and generation (phase-neutral). */
import { SourceMap as NodeSourceMap } from 'node:module';
import type { SourceMap } from 'oxc-transform';
import type { Range } from './schema';

export function createOriginalRangeMapper(
  normalizedSource: string,
  originalSource: string,
  map: SourceMap
): (range: Range) => Range {
  const trace = createNodeSourceMap(map);
  const normalizedLines = lineStarts(normalizedSource);
  const originalLines = lineStarts(originalSource);
  return ([start, end]) => [
    mapOffset(start, normalizedSource.length, normalizedLines, originalLines, trace, false),
    mapOffset(end, normalizedSource.length, normalizedLines, originalLines, trace, true),
  ];
}

export function createNodeSourceMap(map: SourceMap): NodeSourceMap {
  return new NodeSourceMap({
    file: map.file ?? '',
    mappings: map.mappings,
    names: map.names,
    sourceRoot: map.sourceRoot ?? '',
    sources: map.sources,
    sourcesContent: map.sourcesContent ?? [],
    version: map.version,
  });
}

function mapOffset(
  offset: number,
  sourceLength: number,
  normalizedLines: readonly number[],
  originalLines: readonly number[],
  trace: NodeSourceMap,
  preserveGeneratedDelta: boolean
): number {
  const clamped = Math.max(0, Math.min(offset, sourceLength));
  const generated = offsetToPosition(normalizedLines, clamped);
  const segment = trace.findEntry(generated.line - 1, generated.column);
  if (!('originalLine' in segment)) {
    return clamped;
  }
  const lineStart = originalLines[segment.originalLine];
  return lineStart === undefined
    ? clamped
    : lineStart +
        segment.originalColumn +
        (preserveGeneratedDelta ? generated.column - segment.generatedColumn : 0);
}

function lineStarts(source: string): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index++) {
    if (source.charCodeAt(index) === 10) {
      starts.push(index + 1);
    }
  }
  return starts;
}

function offsetToPosition(starts: readonly number[], offset: number) {
  let low = 0;
  let high = starts.length;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if (starts[middle] <= offset) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return { line: low + 1, column: offset - starts[low] };
}

/** Spec: `sources` entries resolve against the map's location, not srcDir. */
export function sourceRelativeToMap(outputPath: string, sourcePath: string): string {
  const outputDir = outputPath.split('/').slice(0, -1);
  const source = sourcePath.split('/');
  let shared = 0;
  while (
    shared < outputDir.length &&
    shared < source.length - 1 &&
    outputDir[shared] === source[shared]
  ) {
    shared++;
  }
  return [...outputDir.slice(shared).map(() => '..'), ...source.slice(shared)].join('/');
}

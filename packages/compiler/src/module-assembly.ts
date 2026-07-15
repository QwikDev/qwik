import MagicString, {
  SourceMap as MagicStringSourceMap,
  type DecodedSourceMap,
  type SourceMapSegment,
} from 'magic-string';
import type { SourceMap } from 'oxc-transform';
import { createNodeSourceMap } from './normalization';
import type { SourceRange } from './types';

export interface RangeReplacement {
  readonly range: SourceRange;
  readonly value: string;
}

export interface AssembledModule {
  readonly code: string;
  readonly map: string | null;
}

/**
 * Applies compiler-owned edits without reconstructing the surrounding module. The generated map
 * points at the normalized module and is optionally composed with the TypeScript normalization map
 * so consumers always see locations in the original input.
 */
export function assembleModule(
  source: string,
  sourcePath: string,
  outputPath: string,
  replacements: readonly RangeReplacement[],
  sourceMaps: boolean,
  normalizedMap: SourceMap | null
): AssembledModule {
  const magic = new MagicString(source, { filename: sourcePath });
  for (const replacement of replacements) {
    const [start, end] = replacement.range;
    if (start === end) {
      magic.appendLeft(start, replacement.value);
    } else {
      magic.overwrite(start, end, replacement.value);
    }
  }

  return finishAssembly(magic, sourcePath, outputPath, sourceMaps, normalizedMap);
}

/** Anchors a generated entry module to the source range that produced it. */
export function assembleGeneratedModule(
  source: string,
  sourcePath: string,
  outputPath: string,
  code: string,
  anchor: SourceRange,
  sourceMaps: boolean,
  normalizedMap: SourceMap | null
): AssembledModule {
  const magic = new MagicString(source, { filename: sourcePath });
  const [start, end] = anchor;
  if (start > 0) {
    magic.remove(0, start);
  }
  magic.overwrite(start, end, code);
  if (end < source.length) {
    magic.remove(end, source.length);
  }
  return finishAssembly(magic, sourcePath, outputPath, sourceMaps, normalizedMap);
}

function finishAssembly(
  magic: MagicString,
  sourcePath: string,
  outputPath: string,
  sourceMaps: boolean,
  normalizedMap: SourceMap | null
): AssembledModule {
  const code = magic.toString();
  if (!sourceMaps) {
    return { code, map: null };
  }

  const emittedMap = magic.generateDecodedMap({
    file: outputPath,
    source: sourcePath,
    includeContent: true,
    hires: true,
  });
  const map =
    normalizedMap === null
      ? new MagicStringSourceMap(emittedMap)
      : composeMaps(emittedMap, normalizedMap);
  const json = JSON.parse(map.toString());
  json.file = outputPath;
  if (normalizedMap === null && json.sources.length === 1) {
    json.sources[0] = sourcePath;
  }
  return { code, map: JSON.stringify(json) };
}

function composeMaps(emitted: DecodedSourceMap, normalized: SourceMap): MagicStringSourceMap {
  const trace = createNodeSourceMap(normalized);
  const mappings = emitted.mappings.map((line) =>
    line.map((segment): SourceMapSegment => {
      if (segment.length === 1) {
        return segment;
      }
      const original = trace.findEntry(segment[2], segment[3]);
      return 'originalLine' in original
        ? [segment[0], 0, original.originalLine, original.originalColumn]
        : [segment[0]];
    })
  );
  return new MagicStringSourceMap({
    ...emitted,
    mappings,
    names: [],
    sources: normalized.sources,
    sourcesContent: normalized.sourcesContent,
  });
}

/** Applies compiler-owned edits to authored source with magic-string, composing normalization maps. */
import MagicString, {
  SourceMap as MagicStringSourceMap,
  type DecodedSourceMap,
  type SourceMapSegment,
} from 'magic-string';
import type { SourceMap } from 'oxc-transform';
import {
  createNodeSourceMap,
  lineStarts,
  offsetToPosition,
  sourceRelativeToMap,
} from '../source-maps';
import type { Range } from '../schema';

export interface RangeReplacement {
  readonly range: Range;
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

/**
 * Prepares one module's source once; the returned call anchors each generated entry module to the
 * source range that produced it, at a cost proportional to that module's code.
 */
export function createGeneratedModuleAssembler(
  source: string,
  sourcePath: string,
  sourceMaps: boolean,
  normalizedMap: SourceMap | null
): (outputPath: string, code: string, anchor: Range) => AssembledModule {
  // Without a map, everything around the anchor goes and the chunk is exactly its code.
  if (!sourceMaps) {
    return (_outputPath, code) => ({ code, map: null });
  }
  const sourceLines = lineStarts(source);
  const composeMap = createMapComposer(normalizedMap);
  const sourcesContentJson = JSON.stringify(
    normalizedMap === null ? [source] : normalizedMap.sourcesContent
  );
  return (outputPath, code, [start]) => {
    const anchor = offsetToPosition(sourceLines, start);
    const emittedMap: DecodedSourceMap = {
      file: outputPath,
      sources: [sourcePath],
      sourcesContent: [source],
      names: [],
      mappings: anchoredMappings(code, anchor.line - 1, anchor.column),
    };
    return {
      code,
      map: serializeMap(composeMap(emittedMap), outputPath, sourcePath, sourcesContentJson),
    };
  };
}

/** The mappings magic-string emits for `code` overwriting an anchor with the rest removed. */
function anchoredMappings(code: string, line: number, column: number): SourceMapSegment[][] {
  const lines = code.split('\n');
  const mappings: SourceMapSegment[][] = [];
  for (let index = 0; index < lines.length; index++) {
    const isTrailingEmptyLine = index === lines.length - 1 && lines[index] === '';
    mappings.push(isTrailingEmptyLine ? [] : [[0, 0, line, column]]);
  }
  return mappings;
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
  const map = createMapComposer(normalizedMap)(emittedMap);
  return { code, map: serializeMap(map, outputPath, sourcePath) };
}

/** The bytes of `map.toString()`, taking `sourcesContent` pre-escaped so chunks share one copy. */
function serializeMap(
  map: MagicStringSourceMap,
  outputPath: string,
  sourcePath: string,
  sourcesContentJson: string | undefined = JSON.stringify(map.sourcesContent)
): string {
  // Spec: `sources` entries resolve against the map's location, not srcDir.
  const sources =
    map.sources.length === 1 ? [sourceRelativeToMap(outputPath, sourcePath)] : map.sources;
  const sourcesContent =
    sourcesContentJson === undefined ? '' : `"sourcesContent":${sourcesContentJson},`;
  return (
    `{"version":3,"file":${JSON.stringify(outputPath)},"sources":${JSON.stringify(sources)},` +
    `${sourcesContent}"names":${JSON.stringify(map.names)},"mappings":${JSON.stringify(map.mappings)}}`
  );
}

/** Parses the normalization map once for every emitted map composed with it. */
function createMapComposer(
  normalized: SourceMap | null
): (emitted: DecodedSourceMap) => MagicStringSourceMap {
  if (normalized === null) {
    return (emitted) => new MagicStringSourceMap(emitted);
  }
  const trace = createNodeSourceMap(normalized);
  return (emitted) => {
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
  };
}

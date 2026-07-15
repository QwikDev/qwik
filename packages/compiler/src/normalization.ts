import type {
  Diagnostic,
  TransformModuleInput,
  TransformModulesOptions,
} from '@qwik.dev/optimizer';
import { SourceMap as NodeSourceMap } from 'node:module';
import { transform, type SourceMap } from 'oxc-transform';
import { getLang, isJsxPath, isTypeScriptPath } from './module-utils';
import type { CompilerTransformInput, SourceRange } from './types';

export async function normalizeTransformInput(
  input: TransformModuleInput,
  options: TransformModulesOptions
): Promise<CompilerTransformInput> {
  if (options.transpileTs !== true || !isTypeScriptPath(input.path)) {
    return { ...input, originalCode: input.code, normalizationMap: null };
  }

  const transformed = await transformNormalized(input, options, options.sourceMaps === true);
  return {
    ...input,
    originalCode: input.code,
    code: transformed.code,
    normalizationMap: transformed.map,
  };
}

/**
 * Diagnostics still need original TSX coordinates when output maps are disabled. The exceptional
 * failure path creates the normalization map lazily, keeping the successful no-map path allocation
 * free.
 */
export async function mapDiagnosticsToOriginal(
  input: CompilerTransformInput,
  options: TransformModulesOptions,
  diagnostics: readonly Diagnostic[]
): Promise<Diagnostic[]> {
  if (
    diagnostics.length === 0 ||
    input.originalCode === undefined ||
    input.originalCode === input.code
  ) {
    return [...diagnostics];
  }
  const rawMap =
    input.normalizationMap ??
    (
      await transformNormalized(
        { path: input.path, devPath: input.devPath, code: input.originalCode },
        options,
        true
      )
    ).map;
  if (rawMap === null) {
    return [...diagnostics];
  }
  const mapper = createOriginalRangeMapper(input.code, input.originalCode, rawMap);
  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    highlights:
      diagnostic.highlights?.map((highlight) => {
        const range = mapper([highlight.lo, highlight.hi]);
        const start = offsetLocation(input.originalCode!, range[0]);
        const end = offsetLocation(input.originalCode!, range[1]);
        return {
          ...highlight,
          lo: range[0],
          hi: range[1],
          startLine: start.line,
          startCol: start.column + 1,
          endLine: end.line,
          endCol: end.column,
        };
      }) ?? null,
  }));
}

export function createOriginalRangeMapper(
  normalizedSource: string,
  originalSource: string,
  map: SourceMap
): (range: SourceRange) => SourceRange {
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

async function transformNormalized(
  input: TransformModuleInput,
  options: TransformModulesOptions,
  sourceMaps: boolean
) {
  const transformed = await transform(input.path, input.code, {
    lang: getLang(input.path),
    sourceType: 'module',
    cwd: options.rootDir,
    sourcemap: sourceMaps,
    jsx: isJsxPath(input.path) ? 'preserve' : undefined,
  });
  return { code: transformed.code, map: sourceMaps ? (transformed.map ?? null) : null };
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

function offsetLocation(source: string, offset: number): { line: number; column: number } {
  const position = offsetToPosition(lineStarts(source), offset);
  return { line: position.line, column: position.column };
}

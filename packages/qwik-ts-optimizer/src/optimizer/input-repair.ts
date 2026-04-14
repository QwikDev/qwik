/**
 * Input preprocessing for parse error recovery.
 *
 * oxc-parser is stricter than SWC and returns empty ASTs for certain
 * syntax errors that SWC recovers from. This module applies targeted
 * repairs to make such inputs parseable while preserving semantics.
 *
 * Repairs are ONLY applied when parseSync returns an empty program body
 * with errors. Well-formed inputs pass through unchanged.
 */

import type { AstEcmaScriptModule, AstProgram } from '../ast-types.js';
import { parseWithRawTransfer } from './utils/parse.js';

/**
 * Attempt to repair source code that oxc-parser cannot parse.
 *
 * Returns the original source unchanged if it parses successfully or
 * no repair strategy succeeds.
 */
export function repairInput(
  source: string,
  filename: string,
): { source: string; program?: AstProgram; module?: AstEcmaScriptModule } {
  const initial = parseWithRawTransfer(filename, source);

  if (initial.program.body.length > 0) {
    return { source, program: initial.program, module: initial.module };
  }

  if (!initial.errors || initial.errors.length === 0) {
    return { source };
  }

  const repairedA = tryRemoveUnmatchedParens(source, filename);
  if (repairedA !== null) return { source: repairedA };

  const repairedB = tryWrapJsxTextArrows(source, filename);
  if (repairedB !== null) return { source: repairedB };

  return { source };
}

/**
 * Remove unmatched closing parentheses when `)` count exceeds `(` count.
 * Only handles single-excess cases, trying each `)` from end to start.
 */
function tryRemoveUnmatchedParens(source: string, filename: string): string | null {
  let openCount = 0;
  let closeCount = 0;

  for (const ch of source) {
    if (ch === '(') openCount++;
    if (ch === ')') closeCount++;
  }

  if (closeCount <= openCount) return null;

  const excess = closeCount - openCount;
  if (excess !== 1) return null;

  const closePositions: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === ')') closePositions.push(i);
  }

  for (let i = closePositions.length - 1; i >= 0; i--) {
    const pos = closePositions[i];
    const candidate = source.slice(0, pos) + source.slice(pos + 1);
    const result = parseWithRawTransfer(filename, candidate);
    if (result.program.body.length > 0) {
      return candidate;
    }
  }

  return null;
}

/**
 * Convert JSX text containing `>` into expression containers `{"text"}`.
 * oxc-parser rejects raw `>` in JSX text that SWC accepts.
 */
function tryWrapJsxTextArrows(source: string, filename: string): string | null {
  const regions = findJsxTextRegionsWithGt(source);
  if (regions.length === 0) return null;

  // Process from end to start to preserve positions
  let repaired = source;
  for (let i = regions.length - 1; i >= 0; i--) {
    const { start, end } = regions[i];
    const text = repaired.slice(start, end);
    const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    repaired = repaired.slice(0, start) + '{"' + escaped + '"}' + repaired.slice(end);
  }

  const result = parseWithRawTransfer(filename, repaired);
  if (result.program.body.length > 0) return repaired;

  return null;
}

/** Regex matching lines composed entirely of closing brackets/punctuation. */
const BRACKET_ONLY_LINE = /^[)\]};,]+$/;

/**
 * Find JSX text regions containing `>` that would cause parse errors.
 * Also captures trailing bracket-only companion lines (e.g. `));`).
 */
function findJsxTextRegionsWithGt(source: string): Array<{ start: number; end: number }> {
  const regions: Array<{ start: number; end: number }> = [];
  const lines = source.split('\n');
  let offset = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const trimmed = line.trim();

    const isSkippable =
      trimmed.length === 0 ||
      trimmed.startsWith('<') ||
      trimmed.startsWith('{') ||
      trimmed.startsWith('//') ||
      trimmed === '>' ||
      trimmed === '/>' ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*');

    if (isSkippable || !trimmed.includes('>')) {
      offset += line.length + 1;
      continue;
    }

    const prevLine = lineIdx > 0 ? lines[lineIdx - 1].trim() : '';
    const nextNonEmpty = findNextNonEmptyLine(lines, lineIdx + 1);

    const prevEndsJsx = prevLine.endsWith('>') || prevLine.endsWith('/>');
    const nextStartsJsx = nextNonEmpty.trim().startsWith('<');

    if (prevEndsJsx || nextStartsJsx) {
      const textStart = offset + line.indexOf(trimmed);
      const textEnd = textStart + trimmed.length;
      regions.push({ start: textStart, end: textEnd });

      // Scan forward for bracket-only companion lines (e.g. `));`)
      for (let j = lineIdx + 1; j < lines.length; j++) {
        const nextTrimmed = lines[j].trim();
        if (nextTrimmed.startsWith('<')) break;
        if (nextTrimmed === '') continue;
        if (BRACKET_ONLY_LINE.test(nextTrimmed)) {
          let nextOffset = 0;
          for (let k = 0; k < j; k++) nextOffset += lines[k].length + 1;
          const nextTextStart = nextOffset + lines[j].indexOf(nextTrimmed);
          const nextTextEnd = nextTextStart + nextTrimmed.length;
          regions.push({ start: nextTextStart, end: nextTextEnd });
        }
      }
    }

    offset += line.length + 1;
  }

  return regions;
}

function findNextNonEmptyLine(lines: string[], startIdx: number): string {
  for (let i = startIdx; i < lines.length; i++) {
    if (lines[i].trim().length > 0) return lines[i];
  }
  return '';
}

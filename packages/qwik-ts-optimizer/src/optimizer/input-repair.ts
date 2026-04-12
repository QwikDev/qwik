/**
 * Input preprocessing for parse error recovery.
 *
 * oxc-parser is stricter than SWC and returns empty ASTs for certain
 * syntax errors that SWC recovers from. This module applies targeted
 * repairs to make such inputs parseable while preserving semantics.
 *
 * Safety: repairs are ONLY applied when parseSync returns an empty
 * program body with errors. Well-formed inputs pass through unchanged.
 *
 * Threat mitigation (T-09-02): Never modify valid code -- only repair
 * when parse already fails completely.
 */

import { parseSync } from 'oxc-parser';

/**
 * Attempt to repair source code that oxc-parser cannot parse.
 *
 * Returns the original source unchanged if:
 * - The source parses successfully (body.length > 0)
 * - No repair strategy succeeds
 *
 * @param source - Source code to potentially repair
 * @param filename - Filename for parser (determines language mode)
 * @returns Repaired source or original source unchanged
 */
export function repairInput(source: string, filename: string): string {
  const initial = parseSync(filename, source, { experimentalRawTransfer: true } as any);
  if (initial.program.body.length > 0) {
    // Parses fine -- no repair needed
    return source;
  }

  if (!initial.errors || initial.errors.length === 0) {
    // Empty body but no errors -- unusual, return unchanged
    return source;
  }

  // Try repair strategies in order. Stop at first success.

  // Strategy A: Remove unmatched closing parens
  const repairedA = tryRemoveUnmatchedParens(source, filename);
  if (repairedA !== null) return repairedA;

  // Strategy B: Wrap JSX text containing arrow syntax in expression containers
  const repairedB = tryWrapJsxTextArrows(source, filename);
  if (repairedB !== null) return repairedB;

  // No repair worked -- return original
  return source;
}

/**
 * Strategy A: Remove unmatched closing parentheses.
 *
 * When there are more `)` than `(` in the source, tries removing
 * each excess `)` one at a time to find a version that parses.
 *
 * Handles example_3: `export const App = () => { ... });`
 * where the `)` before `};` is unmatched.
 */
function tryRemoveUnmatchedParens(source: string, filename: string): string | null {
  let openCount = 0;
  let closeCount = 0;

  // Count parens outside of strings/template literals/comments
  // (simple count is sufficient since we only act when parse fails)
  for (const ch of source) {
    if (ch === '(') openCount++;
    if (ch === ')') closeCount++;
  }

  if (closeCount <= openCount) return null;

  const excess = closeCount - openCount;

  // Find all `)` positions
  const closePositions: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === ')') closePositions.push(i);
  }

  // Try removing each `)` one at a time (from end to start for typical trailing errors)
  // For single excess, try each position
  if (excess === 1) {
    for (let i = closePositions.length - 1; i >= 0; i--) {
      const pos = closePositions[i];
      const candidate = source.slice(0, pos) + source.slice(pos + 1);
      const result = parseSync(filename, candidate, { experimentalRawTransfer: true } as any);
      if (result.program.body.length > 0) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Strategy B: Convert JSX text containing `>` into string expression containers.
 *
 * When JSX children contain raw text with `>` characters (often from arrow
 * functions like `[].map(() => (`), oxc-parser fails because `>` is invalid
 * in JSX text. SWC handles this by treating such text as string children.
 *
 * This strategy finds text lines between JSX elements that contain `>` and
 * converts them to JSX string expression containers: `{"text content"}`.
 * This matches SWC's output behavior where these become string children.
 *
 * Handles example_immutable_analysis: `[].map(() => (` and `));` as JSX text.
 */
function tryWrapJsxTextArrows(source: string, filename: string): string | null {
  const regions = findJsxTextRegionsWithGt(source);
  if (regions.length === 0) {
    return null;
  }

  // Build repaired source by converting JSX text to string expressions.
  // Process from end to start to preserve positions.
  let repaired = source;
  for (let i = regions.length - 1; i >= 0; i--) {
    const { start, end } = regions[i];
    const text = repaired.slice(start, end);
    // Escape any quotes in the text, then wrap as {"text"}
    const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    repaired = repaired.slice(0, start) + '{"' + escaped + '"}' + repaired.slice(end);
  }

  const result = parseSync(filename, repaired, { experimentalRawTransfer: true } as any);
  if (result.program.body.length > 0) {
    return repaired;
  }

  return null;
}

/**
 * Find JSX text regions that contain `>` characters.
 *
 * Looks for text lines between JSX elements (after a closing `>` and before
 * an opening `<`) that contain `>` which would cause parse errors.
 *
 * Also finds companion lines (like `));`) that follow the JSX element
 * block and are also JSX text.
 */
function findJsxTextRegionsWithGt(source: string): Array<{ start: number; end: number }> {
  const regions: Array<{ start: number; end: number }> = [];
  const lines = source.split('\n');
  let offset = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const trimmed = line.trim();

    // Skip empty lines, JSX tags, expression containers, comments,
    // and lone closing brackets (> or />) which are tag close brackets
    if (
      trimmed.length === 0 ||
      trimmed.startsWith('<') ||
      trimmed.startsWith('{') ||
      trimmed.startsWith('//') ||
      trimmed === '>' ||
      trimmed === '/>' ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*')
    ) {
      offset += line.length + 1;
      continue;
    }

    // Check if this line contains `>` (which breaks JSX text parsing)
    if (!trimmed.includes('>')) {
      offset += line.length + 1;
      continue;
    }

    // Check if this looks like JSX text by examining surrounding context
    const prevLine = lineIdx > 0 ? lines[lineIdx - 1].trim() : '';
    const nextNonEmpty = findNextNonEmptyLine(lines, lineIdx + 1);

    // Previous line ends with > or /> (closing a JSX tag or element)
    const prevEndsJsx = prevLine.endsWith('>') || prevLine.endsWith('/>');
    const nextStartsJsx = nextNonEmpty.trim().startsWith('<');

    if (prevEndsJsx || nextStartsJsx) {
      // This is JSX text containing > -- needs to be wrapped
      const textStart = offset + line.indexOf(trimmed);
      const textEnd = textStart + trimmed.length;
      regions.push({ start: textStart, end: textEnd });

      // Scan forward for companion lines that are also JSX text
      // (e.g., `));` after a `<Component .../>` block)
      for (let j = lineIdx + 1; j < lines.length; j++) {
        const nextTrimmed = lines[j].trim();
        if (nextTrimmed.startsWith('<')) break; // Hit next JSX element
        if (nextTrimmed === '') continue;
        // Lines like `));` or `);` between JSX elements are also JSX text
        if (/^[)\]};,]+$/.test(nextTrimmed)) {
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

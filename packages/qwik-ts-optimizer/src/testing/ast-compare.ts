import { parseSync } from 'oxc-parser';
import equal from 'fast-deep-equal';

export interface AstCompareResult {
  match: boolean;
  expectedParseError: string | null;
  actualParseError: string | null;
}

/**
 * Compare two code strings for semantic AST equivalence.
 * Uses oxc-parser to parse both strings, strips position/range data,
 * and performs deep structural comparison.
 *
 * @param expected - The expected code string (from snapshot)
 * @param actual - The actual code string (from optimizer output)
 * @param filename - Filename hint for parser (determines language: .tsx, .ts, .js)
 * @returns AstCompareResult with match status and any parse errors
 */
export function compareAst(
  expected: string,
  actual: string,
  filename: string,
): AstCompareResult {
  // Parse both strings with oxc-parser
  const expectedResult = parseSync(filename, expected);
  const actualResult = parseSync(filename, actual);

  // Check for parse errors
  const expectedErrors = expectedResult.errors?.length
    ? expectedResult.errors.map((e) => e.message).join('; ')
    : null;
  const actualErrors = actualResult.errors?.length
    ? actualResult.errors.map((e) => e.message).join('; ')
    : null;

  if (expectedErrors || actualErrors) {
    return {
      match: false,
      expectedParseError: expectedErrors,
      actualParseError: actualErrors,
    };
  }

  // Strip position data and compare structurally
  const cleanExpected = stripPositions(expectedResult.program);
  const cleanActual = stripPositions(actualResult.program);

  return {
    match: equal(cleanExpected, cleanActual),
    expectedParseError: null,
    actualParseError: null,
  };
}

function stripPositions(node: any): any {
  if (Array.isArray(node)) return node.map(stripPositions);
  if (node === null || typeof node !== 'object') return node;

  // Unwrap ParenthesizedExpression -- semantically equivalent to the inner expression
  if (node.type === 'ParenthesizedExpression' && node.expression) {
    return stripPositions(node.expression);
  }

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(node)) {
    // Skip position-related fields
    // Skip position-related and cosmetic fields
    if (
      key === 'start' ||
      key === 'end' ||
      key === 'loc' ||
      key === 'range' ||
      key === 'raw' // quote style, numeric format — not semantic
    )
      continue;
    cleaned[key] = stripPositions(value);
  }
  return cleaned;
}

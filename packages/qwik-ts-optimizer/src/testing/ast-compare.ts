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

function shouldStripRaw(node: any, ancestors: any[]): boolean {
  if (node?.type === 'Literal' || node?.type === 'JSXText') {
    return true;
  }

  // TemplateElement.value.raw is cosmetic for untagged templates,
  // but observable for tagged templates via strings.raw.
  const [parent, grandparent, greatGrandparent] = ancestors;
  if (
    parent?.type === 'TemplateElement' &&
    grandparent?.type === 'TemplateLiteral' &&
    greatGrandparent?.type !== 'TaggedTemplateExpression'
  ) {
    return true;
  }

  return false;
}

function stripPositions(node: any, ancestors: any[] = []): any {
  if (Array.isArray(node)) return node.map((item) => stripPositions(item, ancestors));
  if (node === null || typeof node !== 'object') return node;

  // Unwrap ParenthesizedExpression -- semantically equivalent to the inner expression
  if (node.type === 'ParenthesizedExpression' && node.expression) {
    return stripPositions(node.expression, ancestors);
  }

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(node)) {
    // Skip position-related fields and cosmetic raw spellings.
    if (
      key === 'start' ||
      key === 'end' ||
      key === 'loc' ||
      key === 'range' ||
      (key === 'raw' && shouldStripRaw(node, ancestors))
    )
      continue;
    cleaned[key] = stripPositions(value, [node, ...ancestors].slice(0, 3));
  }
  return cleaned;
}

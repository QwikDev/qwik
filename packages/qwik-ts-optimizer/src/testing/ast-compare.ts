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

  // Normalize import order: sort ImportDeclaration nodes within the program body
  // since import statement ordering has no semantic meaning in JavaScript/TypeScript.
  normalizeImportOrder(cleanExpected);
  normalizeImportOrder(cleanActual);

  return {
    match: equal(cleanExpected, cleanActual),
    expectedParseError: null,
    actualParseError: null,
  };
}

/**
 * Sort ImportDeclaration nodes at the top of a program body.
 * Import order has no semantic meaning in JS/TS, so sorting makes
 * the comparison order-insensitive for imports.
 */
function normalizeImportOrder(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // Find the contiguous block of imports at the top
  let importEnd = 0;
  while (importEnd < program.body.length && program.body[importEnd]?.type === 'ImportDeclaration') {
    importEnd++;
  }
  if (importEnd <= 1) return; // 0 or 1 imports — nothing to sort

  // Extract import slice, sort by serialized form, put back
  const imports = program.body.slice(0, importEnd);
  imports.sort((a: any, b: any) => {
    const aKey = JSON.stringify(a);
    const bKey = JSON.stringify(b);
    return aKey.localeCompare(bKey);
  });
  program.body.splice(0, importEnd, ...imports);
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

  // Normalize single-statement BlockStatement in control flow (if/else/for/while/do-while)
  // `if (x) y++;` and `if (x) { y++; }` are semantically identical.
  if (node.type === 'BlockStatement' && Array.isArray(node.body) && node.body.length === 1) {
    const parentNode = ancestors[0];
    if (
      parentNode?.type === 'IfStatement' ||
      parentNode?.type === 'ForStatement' ||
      parentNode?.type === 'ForInStatement' ||
      parentNode?.type === 'ForOfStatement' ||
      parentNode?.type === 'WhileStatement' ||
      parentNode?.type === 'DoWhileStatement'
    ) {
      return stripPositions(node.body[0], ancestors);
    }
  }

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(node)) {
    // Skip position-related fields, cosmetic raw spellings, and TS type annotations.
    // TypeScript types don't affect runtime behavior, so they should not affect
    // semantic AST comparison (e.g., `(x: Stuff)` and `(x)` are equivalent).
    if (
      key === 'start' ||
      key === 'end' ||
      key === 'loc' ||
      key === 'range' ||
      key === 'shorthand' ||
      key === 'typeAnnotation' ||
      key === 'returnType' ||
      key === 'typeParameters' ||
      key === 'typeArguments' ||
      (key === 'raw' && shouldStripRaw(node, ancestors))
    )
      continue;
    cleaned[key] = stripPositions(value, [node, ...ancestors].slice(0, 3));
  }
  return cleaned;
}

import { isDeepStrictEqual } from 'node:util';
import { parseSync } from 'oxc-parser';

export interface AstCompareResult {
  match: boolean;
  expectedParseError: string | null;
  actualParseError: string | null;
}

const POSITION_KEYS = new Set(['start', 'end', 'loc', 'range']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shouldStripRaw(
  node: Record<string, unknown>,
  ancestors: readonly Record<string, unknown>[]
): boolean {
  if (node.type === 'Literal' || node.type === 'JSXText') {
    return true;
  }
  const [parent, grandparent, greatGrandparent] = ancestors;
  return (
    parent?.type === 'TemplateElement' &&
    grandparent?.type === 'TemplateLiteral' &&
    greatGrandparent?.type !== 'TaggedTemplateExpression'
  );
}

export function stripAstPositions(
  node: unknown,
  ancestors: readonly Record<string, unknown>[] = []
): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => stripAstPositions(item, ancestors));
  }
  if (!isRecord(node)) {
    return node;
  }
  if (node.type === 'ParenthesizedExpression' && node.expression) {
    return stripAstPositions(node.expression, ancestors);
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (POSITION_KEYS.has(key) || (key === 'raw' && shouldStripRaw(node, ancestors))) {
      continue;
    }
    result[key] = stripAstPositions(value, [node, ...ancestors].slice(0, 3));
  }
  return result;
}

function parse(filename: string, code: string) {
  const parsed = parseSync(filename, code);
  if (!parsed.errors?.length || (!filename.endsWith('.js') && !filename.endsWith('.ts'))) {
    return parsed;
  }

  const jsxFilename = filename.replace(/\.(js|ts)$/, '.tsx');
  const jsxParsed = parseSync(jsxFilename, code);
  return jsxParsed.errors.length < parsed.errors.length ? jsxParsed : parsed;
}

export function compareAst(expected: string, actual: string, filename: string): AstCompareResult {
  const expectedResult = parse(filename, expected);
  const actualResult = parse(filename, actual);
  const expectedParseError = expectedResult.errors.length
    ? expectedResult.errors.map((error) => error.message).join('; ')
    : null;
  const actualParseError = actualResult.errors.length
    ? actualResult.errors.map((error) => error.message).join('; ')
    : null;

  const match =
    (expectedParseError === null) === (actualParseError === null) &&
    !!expectedResult.program &&
    !!actualResult.program &&
    isDeepStrictEqual(
      stripAstPositions(expectedResult.program),
      stripAstPositions(actualResult.program)
    );

  return { match, expectedParseError, actualParseError };
}

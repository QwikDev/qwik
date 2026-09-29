import { isDeepStrictEqual } from 'node:util';
import { parseSync } from 'oxc-parser';

export interface AstCompareResult {
  match: boolean;
  difference: string | null;
  expectedParseError: string | null;
  actualParseError: string | null;
}

const POSITION_KEYS = new Set(['start', 'end', 'loc', 'range']);
const BLOCK_EQUIVALENT_STATEMENTS = new Set([
  'BreakStatement',
  'ContinueStatement',
  'ExpressionStatement',
  'ForOfStatement',
  'ReturnStatement',
  'ThrowStatement',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectIdentifierNames(node: unknown, names: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectIdentifierNames(item, names);
    }
    return;
  }
  if (!isRecord(node)) {
    return;
  }
  if (node.type === 'Identifier' && typeof node.name === 'string') {
    names.add(node.name);
  }
  for (const value of Object.values(node)) {
    collectIdentifierNames(value, names);
  }
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
  const parent = ancestors[0];
  const onlyStatement = Array.isArray(node.body) && node.body.length === 1 ? node.body[0] : null;
  if (
    node.type === 'BlockStatement' &&
    isRecord(onlyStatement) &&
    (BLOCK_EQUIVALENT_STATEMENTS.has(String(onlyStatement.type)) ||
      (onlyStatement.type === 'IfStatement' &&
        (parent?.body === node || parent?.alternate === node)))
  ) {
    return stripAstPositions(onlyStatement, ancestors);
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (POSITION_KEYS.has(key) || (key === 'raw' && shouldStripRaw(node, ancestors))) {
      continue;
    }
    if (
      key === 'key' &&
      node.type === 'Property' &&
      node.computed === false &&
      isRecord(value) &&
      (value.type === 'Identifier' || (value.type === 'Literal' && typeof value.value === 'string'))
    ) {
      result[key] = {
        type: 'Literal',
        value: value.type === 'Identifier' ? value.name : value.value,
      };
      continue;
    }
    result[key] =
      key === 'shorthand' && node.type === 'Property'
        ? false
        : stripAstPositions(value, [node, ...ancestors].slice(0, 3));
  }
  return result;
}

function normalizeImports(program: unknown): unknown {
  if (!isRecord(program) || !Array.isArray(program.body)) {
    return program;
  }

  const groups = new Map<string, { declaration: Record<string, unknown>; specifiers: unknown[] }>();
  let importCount = 0;
  for (const statement of program.body) {
    if (!isRecord(statement) || statement.type !== 'ImportDeclaration') {
      break;
    }
    importCount++;
    const declaration = { ...statement, specifiers: [] };
    const key = JSON.stringify(declaration);
    const group = groups.get(key) ?? { declaration, specifiers: [] as unknown[] };
    group.specifiers.push(...(Array.isArray(statement.specifiers) ? statement.specifiers : []));
    groups.set(key, group);
  }
  if (importCount === 0) {
    return program;
  }

  const usedNames = new Set<string>();
  collectIdentifierNames(program.body.slice(importCount), usedNames);
  const imports = [...groups.values()].map(({ declaration, specifiers }) => ({
    ...declaration,
    specifiers: specifiers
      .filter(
        (specifier) =>
          !isRecord(specifier) ||
          !isRecord(specifier.local) ||
          typeof specifier.local.name !== 'string' ||
          usedNames.has(specifier.local.name)
      )
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  }));
  return { ...program, body: [...imports, ...program.body.slice(importCount)] };
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

function formatValue(value: unknown): string {
  const formatted = JSON.stringify(value);
  return formatted && formatted.length > 120 ? `${formatted.slice(0, 117)}...` : formatted;
}

function findDifference(expected: unknown, actual: unknown, path = 'program'): string | null {
  if (isDeepStrictEqual(expected, actual)) {
    return null;
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    for (let index = 0; index < Math.min(expected.length, actual.length); index++) {
      const difference = findDifference(expected[index], actual[index], `${path}[${index}]`);
      if (difference) {
        return difference;
      }
    }
    return `${path}.length: expected ${expected.length}, received ${actual.length}`;
  }
  if (isRecord(expected) && isRecord(actual)) {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      if (!Object.hasOwn(expected, key) || !Object.hasOwn(actual, key)) {
        return `${path}.${key}: ${Object.hasOwn(expected, key) ? 'missing from actual' : 'missing from expected'}`;
      }
      const difference = findDifference(expected[key], actual[key], `${path}.${key}`);
      if (difference) {
        return difference;
      }
    }
  }
  return `${path}: expected ${formatValue(expected)}, received ${formatValue(actual)}`;
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

  const parseErrorsMatch = (expectedParseError === null) === (actualParseError === null);
  const difference = parseErrorsMatch
    ? findDifference(
        normalizeImports(stripAstPositions(expectedResult.program)),
        normalizeImports(stripAstPositions(actualResult.program))
      )
    : 'program.parseErrors: only one side failed to parse';
  const match = parseErrorsMatch && difference === null;

  return { match, difference, expectedParseError, actualParseError };
}

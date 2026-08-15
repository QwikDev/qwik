import type { Function as OxcFunction } from 'oxc-parser';
import { getParams, getRange, unwrapExpression, visit } from './ast-utils';
import { getStaticBranchCondition } from './jsx-ast-utils';
import type { AstFunction, AstNode, SourceRange } from './types';
import { findBindingByDeclaration } from './analysis';
import type {
  BindingId,
  ComponentParameterPlan,
  ComponentShape,
  GuardArmShape,
  GuardShape,
  ModuleAnalysis,
} from './plan-types';

type ComponentShapeFailure = { kind: 'failure'; range: SourceRange; message: string };

export type ComponentShapeResult =
  | { kind: 'success'; shape: ComponentShape }
  | ComponentShapeFailure;

type ComponentParameterResult =
  | { kind: 'success'; parameter: ComponentParameterPlan }
  | ComponentShapeFailure;

const TOP_LEVEL_CONTROL_FLOW = new Set([
  'BlockStatement',
  'BreakStatement',
  'ContinueStatement',
  'DoWhileStatement',
  'ForInStatement',
  'ForOfStatement',
  'ForStatement',
  'LabeledStatement',
  'SwitchStatement',
  'ThrowStatement',
  'TryStatement',
  'WhileStatement',
  'WithStatement',
]);

export function analyzeComponentShape(
  fn: AstFunction,
  bindingId: BindingId | null,
  analysis: ModuleAnalysis
): ComponentShapeResult {
  if (fn.params.length > 1) {
    return failure(
      getRange(fn.params[1]) ?? getRange(fn) ?? [0, 0],
      'A component accepts at most one parameter.'
    );
  }

  const parameterResult =
    fn.params.length === 0 ? null : analyzeParameter(fn.params[0], fn, analysis);
  if (parameterResult?.kind === 'failure') {
    return parameterResult;
  }
  const parameter = parameterResult?.parameter ?? null;

  const body = unwrapExpression(fn.body);
  if (body === null || body === undefined) {
    return failure(getRange(fn) ?? [0, 0], 'The component body has no render expression.');
  }
  if (body.type !== 'BlockStatement') {
    const returnExpression = getRange(body);
    return returnExpression === null
      ? failure(getRange(fn) ?? [0, 0], 'The component render expression has no source range.')
      : {
          kind: 'success',
          shape: {
            bindingId,
            async: fn.async,
            setup: [],
            returnExpression,
            guard: null,
            parameter,
          },
        };
  }

  const bodyRange = getRange(body) ?? [0, 0];
  const analyzed = analyzeStatements(body.body, bodyRange);
  if (analyzed.kind === 'failure') {
    return analyzed;
  }
  if (analyzed.guard === null && analyzed.returnExpression === null) {
    const nestedReturn = findNestedReturn(body);
    return failure(
      getRange(nestedReturn) ?? bodyRange,
      'A component block must contain exactly one direct top-level return.'
    );
  }
  return {
    kind: 'success',
    shape: {
      bindingId,
      async: fn.async,
      setup: analyzed.setup,
      returnExpression: analyzed.returnExpression ?? analyzed.guard!.range,
      guard: analyzed.guard,
      parameter,
    },
  };
}

type BodyShapeResult =
  | {
      kind: 'body';
      setup: SourceRange[];
      returnExpression: SourceRange | null;
      guard: GuardShape | null;
    }
  | ComponentShapeFailure;

/**
 * Splits a statement list into linear setup plus one exit: a direct return, or a guard `if` whose
 * arms recurse. Guards with a statically known condition collapse into the live arm here, so dead
 * flavors never reach lowering.
 */
export function analyzeStatements(
  statements: readonly AstNode[],
  enclosingRange: SourceRange
): BodyShapeResult {
  const setup: SourceRange[] = [];
  for (let index = 0; index < statements.length; index++) {
    const statement = statements[index];
    if (TOP_LEVEL_CONTROL_FLOW.has(statement.type)) {
      return failure(
        getRange(statement) ?? enclosingRange,
        'A component body must have linear setup before one direct return.'
      );
    }
    if (statement.type === 'ReturnStatement') {
      if (index !== statements.length - 1) {
        return failure(
          getRange(statements[index + 1]) ?? getRange(statement) ?? enclosingRange,
          'A component cannot contain statements after its render return.'
        );
      }
      if (statement.argument == null) {
        return { kind: 'body', setup, returnExpression: null, guard: null };
      }
      const returnExpression = getRange(statement.argument);
      if (returnExpression === null) {
        return failure(
          getRange(statement) ?? enclosingRange,
          'A component return must contain a render expression.'
        );
      }
      return { kind: 'body', setup, returnExpression, guard: null };
    }
    if (statement.type === 'IfStatement' && containsGuardReturn(statement)) {
      const guarded = analyzeGuardStatement(statement, statements.slice(index + 1), enclosingRange);
      if (guarded.kind === 'failure') {
        return guarded;
      }
      return { ...guarded, setup: [...setup, ...guarded.setup] };
    }
    if (statement.type === 'IfStatement') {
      const conditional = findConditionalSetupViolation(statement);
      if (conditional !== null) {
        return conditional;
      }
    }
    const range = getRange(statement);
    if (range === null) {
      return failure(enclosingRange, 'A setup statement has no range.');
    }
    setup.push(range);
  }
  return { kind: 'body', setup, returnExpression: null, guard: null };
}

function analyzeGuardStatement(
  statement: AstNode & { type: 'IfStatement' },
  rest: readonly AstNode[],
  enclosingRange: SourceRange
): BodyShapeResult {
  const test = statement.test;
  const alternate = statement.alternate ?? null;
  const staticValue = staticGuardCondition(test);
  if (staticValue !== null) {
    // dead arms drop before any analysis, so flavor-only code never diagnoses
    const live = staticValue
      ? guardBlockStatements(statement.consequent)
      : alternate === null
        ? []
        : guardBlockStatements(alternate);
    const terminated = staticValue && statementsTerminate(live);
    return analyzeStatements(terminated ? live : [...live, ...rest], enclosingRange);
  }
  if (alternate !== null && rest.length > 0) {
    return failure(
      getRange(rest[0]) ?? enclosingRange,
      'A returning if/else cannot be followed by more statements; move the trailing code into the else.'
    );
  }
  const conditionRange = getRange(test);
  const statementRange = getRange(statement);
  if (conditionRange === null || statementRange === null) {
    return failure(enclosingRange, 'A guard condition has no source range.');
  }
  const thenStatements = guardBlockStatements(statement.consequent);
  const elseStatements = alternate === null ? rest : guardBlockStatements(alternate);
  const thenArm = analyzeGuardArm(thenStatements, statementRange);
  if (thenArm.kind === 'failure') {
    return thenArm;
  }
  const elseArm = analyzeGuardArm(elseStatements, statementRange);
  if (elseArm.kind === 'failure') {
    return elseArm;
  }
  const lastStatement = rest.length > 0 ? rest[rest.length - 1] : statement;
  const range: SourceRange = [statementRange[0], getRange(lastStatement)?.[1] ?? statementRange[1]];
  return {
    kind: 'body',
    setup: [],
    returnExpression: null,
    guard: { range, condition: conditionRange, then: thenArm.arm, else: elseArm.arm },
  };
}

function analyzeGuardArm(
  statements: readonly AstNode[],
  fallbackRange: SourceRange
): { kind: 'arm'; arm: GuardArmShape } | ComponentShapeFailure {
  const range = statementsRange(statements) ?? [fallbackRange[1], fallbackRange[1]];
  const hookViolation = findGuardArmHookViolation(statements);
  if (hookViolation !== null) {
    return hookViolation;
  }
  const body = analyzeStatements(statements, range);
  if (body.kind === 'failure') {
    return body;
  }
  return {
    kind: 'arm',
    arm: {
      range,
      setup: body.setup,
      exit:
        body.guard !== null
          ? { kind: 'guard', guard: body.guard }
          : { kind: 'return', expression: body.returnExpression },
    },
  };
}

function statementsRange(statements: readonly AstNode[]): SourceRange | null {
  const first = statements.length > 0 ? getRange(statements[0]) : null;
  const last = statements.length > 0 ? getRange(statements[statements.length - 1]) : null;
  return first === null || last === null ? null : [first[0], last[1]];
}

function guardBlockStatements(node: AstNode): readonly AstNode[] {
  return node.type === 'BlockStatement' ? node.body : [node];
}

/** A guard-depth return: directly in the arm statements or inside a nested guard if. */
function containsGuardReturn(statement: AstNode): boolean {
  if (statement.type !== 'IfStatement') {
    return false;
  }
  const arms = [
    ...guardBlockStatements(statement.consequent),
    ...(statement.alternate == null ? [] : guardBlockStatements(statement.alternate)),
  ];
  return arms.some(
    (armStatement) =>
      armStatement.type === 'ReturnStatement' || containsGuardReturn(armStatement as AstNode)
  );
}

function statementsTerminate(statements: readonly AstNode[]): boolean {
  const last = statements.length > 0 ? statements[statements.length - 1] : null;
  if (last === null) {
    return false;
  }
  if (last.type === 'ReturnStatement') {
    return true;
  }
  return (
    last.type === 'IfStatement' &&
    last.alternate != null &&
    statementsTerminate(guardBlockStatements(last.consequent)) &&
    statementsTerminate(guardBlockStatements(last.alternate))
  );
}

/** Handles the folded literals and their negation: `true`, `!false`, `!!cond` stays runtime. */
function staticGuardCondition(node: AstNode): boolean | null {
  const test = unwrapExpression(node);
  if (test == null) {
    return null;
  }
  if (test.type === 'UnaryExpression' && test.operator === '!') {
    const inner = staticGuardCondition(test.argument as AstNode);
    return inner === null ? null : !inner;
  }
  return getStaticBranchCondition(test);
}

function findGuardArmHookViolation(statements: readonly AstNode[]): ComponentShapeFailure | null {
  for (const statement of statements) {
    let found: ComponentShapeFailure | null = null;
    visit(statement, (node) => {
      if (found !== null || isFunctionNode(node)) {
        return;
      }
      if (node.type === 'CallExpression') {
        const callee = unwrapExpression((node as { callee: unknown }).callee);
        const name = callee?.type === 'Identifier' ? (callee as { name: string }).name : null;
        if (name !== null && /^use[A-Z]/.test(name)) {
          found = failure(
            getRange(node) ?? [0, 0],
            `${name}() cannot be called conditionally: hooks are positional, so every render must call them in the same order.`
          );
        }
      }
    });
    if (found !== null) {
      return found;
    }
  }
  return null;
}

function analyzeParameter(
  parameter: OxcFunction['params'][number],
  fn: AstFunction,
  analysis: ModuleAnalysis
): ComponentParameterResult {
  const originalRange = getRange(parameter) ?? getRange(fn) ?? [0, 0];
  let pattern = unwrapExpression(parameter);
  if (pattern?.type === 'AssignmentPattern') {
    pattern = unwrapExpression(pattern.left);
  }
  if (pattern?.type !== 'Identifier' && pattern?.type !== 'ObjectPattern') {
    return failure(originalRange, 'A component parameter must be an identifier or object pattern.');
  }
  const bindingIds: BindingId[] = [];
  collectPatternBindings(pattern, analysis, bindingIds);
  return {
    kind: 'success',
    parameter: {
      kind: pattern.type === 'Identifier' ? 'identifier' : 'object',
      range: originalRange,
      bindingIds,
      param: getParams(fn)[0],
    },
  };
}

function collectPatternBindings(
  pattern: unknown,
  analysis: ModuleAnalysis,
  bindingIds: BindingId[]
): void {
  const node = unwrapExpression(pattern);
  if (!node) {
    return;
  }
  switch (node.type) {
    case 'Identifier': {
      const binding = findBindingByDeclaration(analysis, node.name, getRange(node));
      if (binding !== null) {
        bindingIds.push(binding.id);
      }
      return;
    }
    case 'AssignmentPattern':
      collectPatternBindings(node.left, analysis, bindingIds);
      return;
    case 'RestElement':
      collectPatternBindings(node.argument, analysis, bindingIds);
      return;
    case 'ArrayPattern':
      for (const element of node.elements) {
        collectPatternBindings(element, analysis, bindingIds);
      }
      return;
    case 'ObjectPattern':
      for (const property of node.properties) {
        collectPatternBindings(
          property.type === 'RestElement' ? property.argument : property.value,
          analysis,
          bindingIds
        );
      }
  }
}

/**
 * A setup `if` may hold plain computation only. Hooks are positional, so a conditional call would
 * shift every later id; a `return` is a conditional render, which belongs to the branch op; JSX and
 * `$` boundaries are extracted by range and cannot ride the opaque js setup op.
 */
function findConditionalSetupViolation(statement: AstNode): ComponentShapeFailure | null {
  let found: ComponentShapeFailure | null = null;
  const fail = (node: AstNode, message: string): void => {
    found ??= failure(getRange(node) ?? [0, 0], message);
  };
  visit(statement, (node) => {
    if (found !== null) {
      return;
    }
    if (node.type === 'ReturnStatement') {
      fail(
        node,
        'A conditional render must be an expression in the returned JSX, not a return inside an if.'
      );
      return;
    }
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      fail(
        node,
        'JSX inside a setup if is not supported; assign it from a conditional expression in the returned JSX instead.'
      );
      return;
    }
    if (node.type === 'CallExpression') {
      const callee = unwrapExpression((node as { callee: unknown }).callee);
      const name = callee?.type === 'Identifier' ? (callee as { name: string }).name : null;
      if (name !== null && /^use[A-Z]/.test(name)) {
        fail(
          node,
          `${name}() cannot be called conditionally: hooks are positional, so every render must call them in the same order.`
        );
        return;
      }
      if (name !== null && name.endsWith('$')) {
        fail(
          node,
          `${name}() cannot appear inside a setup if: $ boundaries are extracted by position.`
        );
      }
    }
  });
  return found;
}

function findNestedReturn(body: AstNode): AstNode | null {
  let found: AstNode | null = null;
  visit(body, true);
  return found;

  function visit(node: unknown, root = false): void {
    if (found !== null || !isNode(node)) {
      return;
    }
    if (!root && isFunctionNode(node)) {
      return;
    }
    if (node.type === 'ReturnStatement') {
      found = node;
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (SKIPPED_KEYS.has(key)) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const child of value) {
          visit(child);
        }
      } else {
        visit(value);
      }
    }
  }
}

function failure(range: SourceRange, message: string): ComponentShapeFailure {
  return { kind: 'failure', range, message };
}

function isFunctionNode(node: AstNode): boolean {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  );
}

function isNode(node: unknown): node is AstNode {
  return !!node && typeof node === 'object' && 'type' in node && typeof node.type === 'string';
}

const SKIPPED_KEYS = new Set([
  'type',
  'start',
  'end',
  'range',
  'loc',
  'decorators',
  'typeAnnotation',
  'typeParameters',
  'returnType',
]);

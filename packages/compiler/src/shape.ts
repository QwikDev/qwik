import type { Function as OxcFunction } from 'oxc-parser';
import { getParams, getRange, unwrapExpression } from './ast-utils';
import type { AstFunction, AstNode, SourceRange } from './types';
import { findBindingByDeclaration } from './analysis';
import type {
  BindingId,
  ComponentParameterPlan,
  ComponentShape,
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
  'IfStatement',
  'LabeledStatement',
  'SwitchStatement',
  'ThrowStatement',
  'TryStatement',
  'WhileStatement',
  'WithStatement',
]);

export function analyzeComponentShape(
  fn: AstFunction,
  bindingId: BindingId,
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
            parameter,
          },
        };
  }

  for (const statement of body.body) {
    if (TOP_LEVEL_CONTROL_FLOW.has(statement.type)) {
      return failure(
        getRange(statement) ?? getRange(body) ?? [0, 0],
        'A component body must have linear setup before one direct return.'
      );
    }
  }

  const returns = body.body.flatMap((statement, index) =>
    statement.type === 'ReturnStatement' ? [{ statement, index }] : []
  );
  if (returns.length !== 1) {
    const nestedReturn = findNestedReturn(body);
    return failure(
      getRange(nestedReturn) ?? getRange(body) ?? [0, 0],
      'A component block must contain exactly one direct top-level return.'
    );
  }

  const [{ statement: returnStatement, index: returnIndex }] = returns;
  if (returnIndex !== body.body.length - 1) {
    return failure(
      getRange(body.body[returnIndex + 1]) ?? getRange(returnStatement) ?? [0, 0],
      'A component cannot contain statements after its render return.'
    );
  }
  const returnExpression = getRange(returnStatement.argument);
  if (returnExpression === null) {
    return failure(
      getRange(returnStatement) ?? getRange(body) ?? [0, 0],
      'A component return must contain a render expression.'
    );
  }

  const setup: SourceRange[] = [];
  for (let index = 0; index < returnIndex; index++) {
    const range = getRange(body.body[index]);
    if (range === null) {
      return failure(getRange(body.body[index - 1]) ?? [0, 0], 'A setup statement has no range.');
    }
    setup.push(range);
  }
  return {
    kind: 'success',
    shape: {
      bindingId,
      async: fn.async,
      setup,
      returnExpression,
      parameter,
    },
  };
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

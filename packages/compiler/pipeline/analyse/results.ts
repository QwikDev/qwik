import type { Node, BindingPattern } from 'oxc-parser';
import { ValueIrKind as Ir } from '../../src/expr-ir';
import type { BindingResult, Result } from '../schema';
import type { LowerContext } from './lower-context';
import { identifierName, unwrapExpression } from './ast/utils';
import { LocalKind } from './locals';
import { ImplicitBindingKind } from './ast/bindings';
import { JsxValueKind } from './ast/jsx-analysis';

const unknown: Result = { kind: 'unknown-result' };
const empty: Result = { kind: Ir.Undef };
const text: Result = { kind: 'scalar-result' };
const read = (binding: number): Result => ({ kind: Ir.BindingRead, binding });

/** Retains value dependencies without changing executable payloads or captures. */
export function expressionResult(input: Node | null, ctx: LowerContext): Result {
  if (input === null) {
    return empty;
  }
  const node = unwrapExpression(input);
  if (node === null) {
    return unknown;
  }
  switch (node.type) {
    case 'Literal':
      return node.value === null ||
        typeof node.value === 'string' ||
        typeof node.value === 'number' ||
        typeof node.value === 'boolean'
        ? { kind: Ir.Lit, value: node.value }
        : unknown;
    case 'Identifier':
    case 'JSXIdentifier': {
      const binding = ctx.bindings.reference(node);
      if (binding === null) {
        return node.name === 'undefined' ? empty : unknown;
      }
      const local = ctx.locals.get(binding);
      if (local?.kind === LocalKind.RowIndex) {
        return { kind: 'number-result' };
      }
      return read(binding);
    }
    case 'JSXElement':
    case 'JSXFragment':
      return { kind: 'render-result' };
    case 'MemberExpression': {
      const name = node.computed
        ? node.property.type === 'Literal'
          ? String(node.property.value)
          : null
        : identifierName(node.property);
      return name === null
        ? {
            kind: Ir.Index,
            obj: expressionResult(node.object, ctx),
            key: expressionResult(node.property, ctx),
          }
        : { kind: Ir.Member, obj: expressionResult(node.object, ctx), name };
    }
    case 'TemplateLiteral':
    case 'BinaryExpression':
    case 'UnaryExpression':
    case 'UpdateExpression':
      return text;
    case 'ConditionalExpression':
      return {
        kind: 'union-result',
        values: [expressionResult(node.consequent, ctx), expressionResult(node.alternate, ctx)],
      };
    case 'LogicalExpression':
      return {
        kind: Ir.Logic,
        op: node.operator,
        left: expressionResult(node.left, ctx),
        right: expressionResult(node.right, ctx),
      };
    case 'SequenceExpression':
      return expressionResult(node.expressions.at(-1)!, ctx);
    case 'AssignmentExpression':
      return node.operator === '='
        ? expressionResult(node.right, ctx)
        : ['&&=', '||=', '??='].includes(node.operator)
          ? {
              kind: 'union-result',
              values: [expressionResult(node.left, ctx), expressionResult(node.right, ctx)],
            }
          : text;
    case 'AwaitExpression':
      return expressionResult(node.argument, ctx);
    case 'ChainExpression':
      return { kind: 'union-result', values: [empty, expressionResult(node.expression, ctx)] };
    case 'ArrayExpression':
      return {
        kind: Ir.Array,
        items: node.elements.map((element) =>
          element?.type === 'SpreadElement' ? unknown : expressionResult(element, ctx)
        ),
      };
    case 'ObjectExpression':
      return {
        kind: 'spread-result',
        parts: node.properties.map((property) => {
          if (property.type === 'SpreadElement') {
            return { name: null, value: expressionResult(property.argument, ctx) };
          }
          const name = property.computed
            ? property.key.type === 'Literal'
              ? String(property.key.value)
              : null
            : property.key.type === 'Literal'
              ? String(property.key.value)
              : identifierName(property.key);
          return {
            name,
            value:
              name === null || property.kind !== 'init'
                ? unknown
                : expressionResult(property.value, ctx),
          };
        }),
      };
    case 'CallExpression': {
      const binding = ctx.bindings.reference(node.callee);
      if (
        binding === null &&
        node.callee.type === 'Identifier' &&
        ['String', 'Number', 'Boolean', 'BigInt'].includes(node.callee.name)
      ) {
        return text;
      }
      const core = binding === null ? undefined : ctx.coreBindings.get(binding);
      const args = node.arguments.map((arg) =>
        arg.type === 'SpreadElement'
          ? ({ kind: 'spread-argument-result' } as Result)
          : expressionResult(arg, ctx)
      );
      if (core === '$') {
        return args[0] ?? unknown;
      }
      if (core === 'useSignal' || core === 'createSignal') {
        return { kind: Ir.Object, entries: [['value', args[0] ?? empty]] };
      }
      if (core === 'useStore') {
        return { kind: 'initializer-result', value: args[0] ?? unknown };
      }
      if (
        core === 'useComputed$' ||
        core === 'useComputed' ||
        core === 'useComputedQrl' ||
        core === 'useAsyncComputed$'
      ) {
        return {
          kind: Ir.Object,
          entries: [
            [
              'value',
              {
                kind: 'union-result',
                values: [
                  { kind: 'invoke-result', callee: args[0] ?? unknown, args: [] },
                  {
                    kind: 'initializer-result',
                    value: { kind: Ir.Member, obj: args[1] ?? empty, name: 'initial' },
                  },
                ],
              },
            ],
          ],
        };
      }
      return { kind: 'invoke-result', callee: expressionResult(node.callee, ctx), args };
    }
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression': {
      const results: Result[] = [];
      if (node.body?.type === 'BlockStatement') {
        results.push(
          ...ctx.bindings
            .returnsOf(node)
            .map((statement) => expressionResult(statement.argument, ctx))
        );
        results.push(empty);
      } else {
        results.push(expressionResult(node.body, ctx));
      }
      return {
        kind: 'function-result',
        params: node.params.map((param) =>
          param.type === 'Identifier' ? ctx.bindings.declaration(param) : null
        ),
        result: { kind: 'union-result', values: results },
      };
    }
    default:
      return unknown;
  }
}

/** Binding ownership supplies assignments and reference uses once per module. */
export function recordBindingResults(ctx: LowerContext): void {
  ctx.plan.invocations = ctx.bindings.calls.map((call) => ({
    callee: expressionResult(call.callee, ctx),
    args: call.arguments.map((arg) =>
      arg.type === 'SpreadElement' ? { kind: 'spread-argument-result' } : expressionResult(arg, ctx)
    ),
  }));
  for (const binding of ctx.plan.bindings) {
    const values: Result[] = binding.result === undefined ? [] : [binding.result.value];
    if (ctx.bindings.implicitKind(binding.id) === ImplicitBindingKind.Arguments) {
      values.push({
        kind: 'spread-result',
        parts: [
          { name: null, value: unknown },
          { name: 'length', value: text },
        ],
      });
    }
    for (const declaration of binding.result === undefined
      ? ctx.bindings.declarationsOf(binding.id)
      : []) {
      if (declaration.type === 'VariableDeclarator') {
        values.push(
          patternResult(declaration.id, binding.id, expressionResult(declaration.init, ctx), ctx) ??
            unknown
        );
      } else if (declaration.type === 'FunctionDeclaration') {
        values.push(expressionResult(declaration, ctx));
      }
    }
    const facts: BindingResult = {
      value: { kind: 'union-result', values },
      writes: [],
      escapes: [],
      consumers: [],
    };
    for (const reference of ctx.bindings.referencesOf(binding.id)) {
      let node: Node = reference.node;
      let parent = ctx.bindings.parentOf(node);
      const path: string[] = [];
      while (parent?.type === 'MemberExpression' && parent.object === node) {
        const name = parent.computed
          ? parent.property.type === 'Literal'
            ? String(parent.property.value)
            : null
          : identifierName(parent.property);
        if (name === null) {
          break;
        }
        path.push(name);
        node = parent;
        parent = ctx.bindings.parentOf(node);
      }
      if (parent?.type === 'AssignmentExpression' && parent.left === node) {
        const value = expressionResult(parent, ctx);
        if (path.length === 0) {
          values.push(value);
        } else {
          facts.writes.push({ path, value });
        }
      } else if (parent?.type === 'UpdateExpression') {
        if (path.length === 0) {
          values.push(text);
        } else {
          facts.writes.push({ path, value: text });
        }
      } else if (parent?.type === 'CallExpression' && parent.callee === node && path.length > 0) {
        if (ctx.jsx.read(parent).kind !== JsxValueKind.Collection) {
          facts.escapes.push(path.slice(0, -1));
        }
      } else if (reference.node.type !== 'JSXIdentifier' && parent?.type !== 'ExportSpecifier') {
        if (parent?.type === 'CallExpression' && parent.callee !== node) {
          const argument = parent.arguments.indexOf(node as (typeof parent.arguments)[number]);
          if (
            argument !== -1 &&
            !parent.arguments.slice(0, argument).some((arg) => arg.type === 'SpreadElement')
          ) {
            facts.consumers!.push({ path, target: expressionResult(parent.callee, ctx), argument });
            continue;
          }
        }
        const attribute =
          parent?.type === 'JSXExpressionContainer' ? ctx.bindings.parentOf(parent) : null;
        const opening =
          attribute?.type === 'JSXAttribute' ? ctx.bindings.parentOf(attribute) : null;
        if (
          opening?.type === 'JSXOpeningElement' &&
          attribute?.type === 'JSXAttribute' &&
          attribute.name.type === 'JSXIdentifier'
        ) {
          facts.consumers!.push({
            path,
            target: expressionResult(opening.name, ctx),
            argument: 0,
            property: attribute.name.name,
          });
          continue;
        }
        // Escaped objects can mutate descendants; primitive values remain immutable. Rendering a
        // value as a JSX child only reads it, so only attribute containers escape.
        if (
          (parent?.type === 'CallExpression' && parent.callee !== node) ||
          parent?.type === 'AssignmentExpression' ||
          parent?.type === 'ReturnStatement' ||
          parent?.type === 'Property' ||
          (parent?.type === 'JSXExpressionContainer' && attribute?.type === 'JSXAttribute') ||
          parent?.type === 'MemberExpression'
        ) {
          facts.escapes.push(path);
        }
      }
    }
    binding.result = facts;
  }
  for (const binding of ctx.plan.bindings) {
    const facts = binding.result;
    if (facts === undefined) {
      continue;
    }
    let value = facts.value;
    const path: string[] = [];
    const seen = new Set([binding.id]);
    while (true) {
      if (value.kind === 'union-result' && value.values.length === 1) {
        value = value.values[0];
      }
      if (value.kind === Ir.Member) {
        path.unshift(value.name);
        value = value.obj;
        continue;
      }
      if (value.kind !== Ir.BindingRead || seen.has(value.binding)) {
        break;
      }
      seen.add(value.binding);
      const target = ctx.plan.bindings[value.binding]?.result;
      if (target === undefined) {
        break;
      }
      target.writes.push(
        ...facts.writes.map((write) => ({ path: [...path, ...write.path], value: write.value }))
      );
      target.escapes.push(...facts.escapes.map((escape) => [...path, ...escape]));
      (target.consumers ??= []).push(
        ...(facts.consumers ?? []).map((consumer) => ({
          ...consumer,
          path: [...path, ...consumer.path],
        }))
      );
      value = target.value;
    }
  }
}

export function patternResult(
  pattern: BindingPattern,
  binding: number,
  source: Result,
  ctx: LowerContext
): Result | null {
  switch (pattern.type) {
    case 'Identifier':
      return ctx.bindings.declaration(pattern) === binding ? source : null;
    case 'AssignmentPattern': {
      const value = patternResult(pattern.left, binding, source, ctx);
      return value === null ? null : defaultResult(value, expressionResult(pattern.right, ctx));
    }
    case 'ObjectPattern': {
      const excluded: string[] = [];
      let hasComputedExclusions = false;
      for (const property of pattern.properties) {
        if (property.type === 'RestElement') {
          const value = patternResult(
            property.argument,
            binding,
            {
              kind: 'rest-result',
              source,
              excluded: [...excluded],
              ...(hasComputedExclusions ? { hasComputedExclusions: true as const } : {}),
            },
            ctx
          );
          if (value !== null) {
            return value;
          }
        } else {
          const name =
            property.key.type === 'Literal'
              ? String(property.key.value)
              : identifierName(property.key);
          const isComputed =
            name === null || (property.computed && property.key.type !== 'Literal');
          if (isComputed) {
            hasComputedExclusions = true;
          } else {
            excluded.push(name);
          }
          const value = patternResult(
            property.value,
            binding,
            isComputed
              ? { kind: Ir.Index, obj: source, key: expressionResult(property.key, ctx) }
              : { kind: Ir.Member, obj: source, name },
            ctx
          );
          if (value !== null) {
            return value;
          }
        }
      }
      return null;
    }
    case 'ArrayPattern': {
      for (let index = 0; index < pattern.elements.length; index++) {
        const element = pattern.elements[index];
        if (element === null) {
          continue;
        }
        const value =
          element.type === 'RestElement'
            ? patternResult(
                element.argument,
                binding,
                { kind: 'array-rest-result', source, start: index },
                ctx
              )
            : patternResult(
                element,
                binding,
                { kind: Ir.Member, obj: source, name: String(index) },
                ctx
              );
        if (value !== null) {
          return value;
        }
      }
      return null;
    }
  }
}

function defaultResult(value: Result, fallback: Result): Result {
  return { kind: 'default-result', value, fallback };
}

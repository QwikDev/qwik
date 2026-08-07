import { getIdentifierName, getRange, unwrapExpression } from './ast-utils';
import { ValueIrKind } from './expr-ir';
import type {
  LambdaIR,
  RenderArgIR,
  ValueIR,
  ValueIrBinOp,
  ValueIrLogicOp,
  ValueIrUnaryOp,
} from './expr-ir';
import type { BindingId, ImportBinding } from './plan-types';
import type { SourceRange } from './types';
import type { AstNode } from './types';

/**
 * Lowers an expression AST into `ValueIR` (specs/02-expression-ir.md), or returns null when any
 * part is outside the portable subset — the caller keeps the source-range path in that case. Never
 * guesses: unsupported constructs (calls, lambdas, assignments, regex, spreads, unknown globals)
 * fail the whole expression.
 */
export interface ExprLowerFacts {
  bindingIdAt(range: SourceRange | null): BindingId | null;
  /** Proven signal-valued binding (`sourceOutputs`) — enables the `signal-read` fast path. */
  isSourceBinding(binding: BindingId): boolean;
  /** Function-valued bindings read as values are call-shaped territory — not lowerable yet. */
  isFunctionBinding(binding: BindingId): boolean;
  /** Index into the module defs table when the binding is an auto-lowered helper. */
  defIndex?(binding: BindingId): number | null;
  /** The binding's import metadata, for plugin claim matching (specs/09). */
  importOf?(binding: BindingId): ImportBinding | null;
  /** Only render-position values may carry render-arg placeholders — plan emission resolves them. */
  allowRenderArgs?: true;
}

/** User compiler plugin (specs/09): claims imported symbols, provides per-target sources. */
export interface QwikCompilerPlugin {
  readonly name: string;
  readonly claims: readonly {
    readonly module: string;
    readonly exports: readonly string[] | '*';
  }[];
  readonly targets: Record<
    string,
    (site: PluginClaimSite) => { source: string; dependencies?: Record<string, string> }
  >;
}

export interface PluginClaimSite {
  readonly fnId: string;
  readonly module: string;
  readonly exportName: string;
  readonly argCount: number;
  readonly async: boolean;
  /** Generated module wrapping the target source; the source defines `pub fn <exportName>`. */
  readonly nativeName: string;
}

/** One claimed fn collected during a module's lowering, carried on the module plan. */
export interface PluginFnPlan {
  readonly fnId: string;
  readonly module: string;
  readonly exportName: string;
  readonly nativeName: string;
  readonly targets: Record<string, { source: string; dependencies?: Record<string, string> }>;
}

let activePlugins: readonly QwikCompilerPlugin[] = [];
let claimedFns = new Map<string, PluginFnPlan>();

/** Install the plugin set for the current module transform; clears collected claims. */
export function setActivePlugins(plugins: readonly QwikCompilerPlugin[] | undefined): void {
  activePlugins = plugins ?? [];
  claimedFns = new Map();
}

/** Registry peek: does this fnId have a registered implementation for `target`? */
export function hasPluginTarget(fnId: string, target: string): boolean {
  return claimedFns.get(fnId)?.targets[target] !== undefined;
}

/** Claimed fns collected since the last `setActivePlugins`, in first-claim order. */
export function drainClaimedPluginFns(): PluginFnPlan[] {
  const drained = [...claimedFns.values()];
  claimedFns = new Map();
  return drained;
}

function pluginFnNativeName(fnId: string): string {
  const sanitized: string = fnId.replace(/[^a-zA-Z0-9]/g, '_');
  return `plugin_${sanitized}`;
}

/**
 * Every identifiable imported fn is plugin-call-addressable — the fnId is module + export. Claims
 * never gate lowering; they only register per-target implementations for the registry.
 */
function claimPluginCall(imported: ImportBinding, argCount: number): string | null {
  // dollar exports ($ transform) and framework exports have compiler-owned semantics
  if (
    imported.typeOnly ||
    imported.importedName === '*' ||
    imported.importedName.endsWith('$') ||
    imported.source.startsWith('@qwik.dev/')
  ) {
    return null;
  }
  const fnId = `plugin:${imported.source}:${imported.importedName}`;
  for (const plugin of activePlugins) {
    for (const claim of plugin.claims) {
      if (claim.module !== imported.source) {
        continue;
      }
      if (claim.exports !== '*' && !claim.exports.includes(imported.importedName)) {
        continue;
      }
      if (!claimedFns.has(fnId)) {
        const site: PluginClaimSite = {
          fnId,
          module: imported.source,
          exportName: imported.importedName,
          argCount,
          async: false,
          nativeName: pluginFnNativeName(fnId),
        };
        const targets: PluginFnPlan['targets'] = {};
        for (const [target, emit] of Object.entries(plugin.targets)) {
          targets[target] = emit(site);
        }
        claimedFns.set(fnId, {
          fnId,
          module: site.module,
          exportName: site.exportName,
          nativeName: site.nativeName,
          targets,
        });
      }
    }
  }
  return fnId;
}

export interface ValueIrCoverage {
  total: number;
  lowered: number;
}

let activeCoverage: ValueIrCoverage | null = null;

/** Test-only coverage tap: counts expression sites lowered vs total until `stop`. */
export function startValueIrCoverage(): ValueIrCoverage {
  const coverage: ValueIrCoverage = { total: 0, lowered: 0 };
  activeCoverage = coverage;
  return coverage;
}

export function stopValueIrCoverage(): void {
  activeCoverage = null;
}

export function reportValueIrSite(lowered: boolean): void {
  if (activeCoverage === null) {
    return;
  }
  activeCoverage.total++;
  if (lowered) {
    activeCoverage.lowered++;
  }
}

const UNARY_OPS: ReadonlySet<string> = new Set([
  '!',
  '-',
  '+',
  'typeof',
] satisfies ValueIrUnaryOp[]);
const BIN_OPS: ReadonlySet<string> = new Set([
  '===',
  '!==',
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  '+',
  '-',
  '*',
  '/',
  '%',
  '**',
] satisfies ValueIrBinOp[]);
const LOGIC_OPS: ReadonlySet<string> = new Set(['&&', '||', '??'] satisfies ValueIrLogicOp[]);

/** Method name → internal-plugin op id (specs/02). Dispatch on receiver type happens at runtime. */
const METHOD_OPS: ReadonlyMap<string, string> = new Map([
  // string
  ['trim', 'qwik:string.trim'],
  ['trimStart', 'qwik:string.trimStart'],
  ['trimEnd', 'qwik:string.trimEnd'],
  ['toUpperCase', 'qwik:string.toUpperCase'],
  ['toLowerCase', 'qwik:string.toLowerCase'],
  ['startsWith', 'qwik:string.startsWith'],
  ['endsWith', 'qwik:string.endsWith'],
  ['split', 'qwik:string.split'],
  ['replaceAll', 'qwik:string.replaceAll'],
  ['padStart', 'qwik:string.padStart'],
  ['padEnd', 'qwik:string.padEnd'],
  ['repeat', 'qwik:string.repeat'],
  ['charAt', 'qwik:string.charAt'],
  // string | array (runtime dispatch)
  ['includes', 'qwik:seq.includes'],
  ['indexOf', 'qwik:seq.indexOf'],
  ['slice', 'qwik:seq.slice'],
  ['at', 'qwik:seq.at'],
  ['concat', 'qwik:seq.concat'],
  // number
  ['toFixed', 'qwik:number.toFixed'],
  // array
  ['join', 'qwik:array.join'],
  ['flat', 'qwik:array.flat'],
  // date
  ['toISOString', 'qwik:date.toISOString'],
  ['getTime', 'qwik:date.getTime'],
]);

/** Higher-order array ops whose single callback argument may be a restricted lambda. */
const HIGHER_ORDER_OPS: ReadonlyMap<string, string> = new Map([
  ['filter', 'qwik:array.filter'],
  ['map', 'qwik:array.map'],
  ['find', 'qwik:array.find'],
  ['findIndex', 'qwik:array.findIndex'],
  ['some', 'qwik:array.some'],
  ['every', 'qwik:array.every'],
]);

/** `<Global>.<method>()` ops — the global identifier must be unbound (a true global). */
const STATIC_OPS: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map([
  ['Promise', new Map([['resolve', 'qwik:promise.resolve']])],
  [
    'Math',
    new Map([
      ['abs', 'qwik:math.abs'],
      ['floor', 'qwik:math.floor'],
      ['ceil', 'qwik:math.ceil'],
      ['round', 'qwik:math.round'],
      ['trunc', 'qwik:math.trunc'],
      ['min', 'qwik:math.min'],
      ['max', 'qwik:math.max'],
      ['sign', 'qwik:math.sign'],
      ['sqrt', 'qwik:math.sqrt'],
    ]),
  ],
  [
    'Object',
    new Map([
      ['keys', 'qwik:object.keys'],
      ['values', 'qwik:object.values'],
      ['entries', 'qwik:object.entries'],
    ]),
  ],
  ['JSON', new Map([['stringify', 'qwik:json.stringify']])],
  [
    'Number',
    new Map([
      ['isNaN', 'qwik:number.isNaN'],
      ['isFinite', 'qwik:number.isFinite'],
      ['isInteger', 'qwik:number.isInteger'],
    ]),
  ],
  ['Array', new Map([['from', 'qwik:array.from']])],
  ['Date', new Map([['now', 'qwik:date.now']])],
]);

/** Bare global calls — the callee identifier must be unbound. */
const GLOBAL_OPS: ReadonlyMap<string, string> = new Map([
  ['String', 'qwik:global.String'],
  ['Number', 'qwik:global.Number'],
  ['Boolean', 'qwik:global.Boolean'],
  ['parseInt', 'qwik:global.parseInt'],
  ['parseFloat', 'qwik:global.parseFloat'],
  ['encodeURIComponent', 'qwik:global.encodeURIComponent'],
  ['decodeURIComponent', 'qwik:global.decodeURIComponent'],
]);

export function lowerValueIr(expression: unknown, facts: ExprLowerFacts): ValueIR | null {
  const node = unwrapExpression(expression);
  if (node === null || node === undefined) {
    return null;
  }
  switch (node.type) {
    case 'Literal': {
      if ((node as { regex?: unknown }).regex !== undefined) {
        return null;
      }
      const value = (node as { value: unknown }).value;
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        return { kind: ValueIrKind.Lit, value };
      }
      return null; // bigint literals stay unsupported for now
    }
    case 'Identifier': {
      const binding = facts.bindingIdAt(getRange(node));
      if (binding === null) {
        return getIdentifierName(node) === 'undefined' ? { kind: ValueIrKind.Undef } : null;
      }
      if (facts.isFunctionBinding(binding)) {
        return null;
      }
      return { kind: ValueIrKind.BindingRead, binding };
    }
    case 'ChainExpression':
      return lowerValueIr((node as { expression: unknown }).expression, facts);
    case 'MemberExpression': {
      const member = node as {
        object: unknown;
        property: unknown;
        computed: boolean;
        optional?: boolean;
      };
      if (!member.computed && getIdentifierName(member.property) === 'value') {
        const object = unwrapExpression(member.object);
        const binding = object?.type === 'Identifier' ? facts.bindingIdAt(getRange(object)) : null;
        if (binding !== null && facts.isSourceBinding(binding)) {
          return { kind: ValueIrKind.SignalRead, binding };
        }
      }
      const obj = lowerValueIr(member.object, facts);
      if (obj === null) {
        return null;
      }
      if (member.computed) {
        const key = lowerValueIr(member.property, facts);
        return key === null
          ? null
          : {
              kind: ValueIrKind.Index,
              obj,
              key,
              ...(member.optional === true ? { optional: true } : {}),
            };
      }
      const name = getIdentifierName(member.property);
      return name === null
        ? null
        : {
            kind: ValueIrKind.Member,
            obj,
            name,
            ...(member.optional === true ? { optional: true } : {}),
          };
    }
    case 'UnaryExpression': {
      const unary = node as { operator: string; argument: unknown };
      if (!UNARY_OPS.has(unary.operator)) {
        return null;
      }
      const operand = lowerValueIr(unary.argument, facts);
      return operand === null
        ? null
        : { kind: ValueIrKind.Unary, op: unary.operator as ValueIrUnaryOp, operand };
    }
    case 'BinaryExpression': {
      const binary = node as { operator: string; left: unknown; right: unknown };
      if (!BIN_OPS.has(binary.operator)) {
        return null;
      }
      const left = lowerValueIr(binary.left, facts);
      const right = left === null ? null : lowerValueIr(binary.right, facts);
      return right === null || left === null
        ? null
        : { kind: ValueIrKind.Bin, op: binary.operator as ValueIrBinOp, left, right };
    }
    case 'LogicalExpression': {
      const logical = node as { operator: string; left: unknown; right: unknown };
      if (!LOGIC_OPS.has(logical.operator)) {
        return null;
      }
      const left = lowerValueIr(logical.left, facts);
      const right = left === null ? null : lowerValueIr(logical.right, facts);
      return right === null || left === null
        ? null
        : { kind: ValueIrKind.Logic, op: logical.operator as ValueIrLogicOp, left, right };
    }
    case 'ConditionalExpression': {
      const conditional = node as { test: unknown; consequent: unknown; alternate: unknown };
      const test = lowerValueIr(conditional.test, facts);
      const then = test === null ? null : lowerValueIr(conditional.consequent, facts);
      const alternate = then === null ? null : lowerValueIr(conditional.alternate, facts);
      return test === null || then === null || alternate === null
        ? null
        : { kind: ValueIrKind.Cond, test, then, else: alternate };
    }
    case 'TemplateLiteral': {
      const template = node as {
        quasis: { value: { cooked?: string | null } }[];
        expressions: unknown[];
      };
      const parts: (string | ValueIR)[] = [];
      for (let i = 0; i < template.quasis.length; i++) {
        const cooked = template.quasis[i].value.cooked;
        if (cooked === undefined || cooked === null) {
          return null;
        }
        if (cooked !== '') {
          parts.push(cooked);
        }
        if (i < template.expressions.length) {
          const part = lowerValueIr(template.expressions[i], facts);
          if (part === null) {
            return null;
          }
          parts.push(part);
        }
      }
      return { kind: ValueIrKind.Template, parts };
    }
    case 'ArrayExpression': {
      const items: ValueIR[] = [];
      for (const element of (node as { elements: unknown[] }).elements) {
        if (element === null) {
          return null; // holes
        }
        if ((element as AstNode).type === 'SpreadElement') {
          return null;
        }
        const item = lowerValueIr(element, facts);
        if (item === null) {
          return null;
        }
        items.push(item);
      }
      return { kind: ValueIrKind.Array, items };
    }
    case 'ObjectExpression': {
      const entries: (readonly [string, ValueIR])[] = [];
      for (const property of (node as { properties: unknown[] }).properties) {
        const prop = property as {
          type: string;
          kind?: string;
          computed?: boolean;
          method?: boolean;
          key?: unknown;
          value?: unknown;
        };
        if (prop.type !== 'Property' || prop.kind !== 'init' || prop.computed || prop.method) {
          return null;
        }
        const key = objectKeyName(prop.key);
        const value = key === null ? null : lowerValueIr(prop.value, facts);
        if (key === null || value === null) {
          return null;
        }
        entries.push([key, value]);
      }
      return { kind: ValueIrKind.Object, entries };
    }
    case 'CallExpression':
      return lowerCall(node, facts);
    default:
      return null;
  }
}

function lowerCall(node: AstNode, facts: ExprLowerFacts): ValueIR | null {
  const call = node as { callee: unknown; arguments: unknown[]; optional?: boolean };
  if (call.optional === true) {
    return null;
  }
  const callee = unwrapExpression(call.callee);
  if (callee === null || callee === undefined) {
    return null;
  }
  // bare global call: String(x), parseInt(x), ...
  if (callee.type === 'Identifier') {
    const calleeBinding = facts.bindingIdAt(getRange(callee));
    if (calleeBinding !== null) {
      const def = facts.defIndex?.(calleeBinding) ?? null;
      if (def === null) {
        const imported = facts.importOf?.(calleeBinding) ?? null;
        const fnId = imported === null ? null : claimPluginCall(imported, call.arguments.length);
        if (fnId === null) {
          return null; // unaddressable callee (component-local fn)
        }
        const args = lowerArgs(call.arguments, facts, null, true);
        return args === null ? null : { kind: ValueIrKind.PluginCall, fnId, args };
      }
      const args = lowerArgs(call.arguments, facts, null) as ValueIR[] | null;
      return args === null ? null : { kind: ValueIrKind.DefCall, def, args };
    }
    const op = GLOBAL_OPS.get(getIdentifierName(callee) ?? '');
    if (op === undefined) {
      return null;
    }
    const args = lowerArgs(call.arguments, facts, null) as (ValueIR | LambdaIR)[] | null;
    return args === null ? null : { kind: ValueIrKind.Call, fn: op, receiver: null, args };
  }
  if (callee.type !== 'MemberExpression') {
    return null;
  }
  const member = callee as {
    object: unknown;
    property: unknown;
    computed: boolean;
    optional?: boolean;
  };
  if (member.computed || member.optional === true) {
    return null;
  }
  const methodName = getIdentifierName(member.property);
  if (methodName === null) {
    return null;
  }
  const object = unwrapExpression(member.object);
  // static op: Math.abs(x), Object.keys(x), ... — object must be a true (unbound) global
  if (
    object?.type === 'Identifier' &&
    facts.bindingIdAt(getRange(object)) === null &&
    STATIC_OPS.has(getIdentifierName(object) ?? '')
  ) {
    const op = STATIC_OPS.get(getIdentifierName(object)!)!.get(methodName);
    if (op === undefined) {
      return null;
    }
    if (op === 'qwik:json.stringify' && call.arguments.length !== 1) {
      return null; // 1-arg form only (specs/02)
    }
    const args = lowerArgs(call.arguments, facts, op === 'qwik:array.from' ? 1 : null) as
      | (ValueIR | LambdaIR)[]
      | null;
    return args === null ? null : { kind: ValueIrKind.Call, fn: op, receiver: null, args };
  }
  // method op: x.trim(), rows.filter(fn), ... — receiver must itself lower
  const higherOrder = HIGHER_ORDER_OPS.get(methodName);
  const op = higherOrder ?? METHOD_OPS.get(methodName);
  if (op === undefined) {
    return null;
  }
  const receiver = lowerValueIr(member.object, facts);
  if (receiver === null) {
    return null;
  }
  const args = lowerArgs(call.arguments, facts, higherOrder !== undefined ? 0 : null) as
    | (ValueIR | LambdaIR)[]
    | null;
  return args === null ? null : { kind: ValueIrKind.Call, fn: op, receiver, args };
}

/** Lowers call arguments; `lambdaAt` marks the single position where a restricted lambda is legal. */
function lowerArgs(
  argumentNodes: unknown[],
  facts: ExprLowerFacts,
  lambdaAt: number | null,
  pluginArgs = false
): (ValueIR | LambdaIR | RenderArgIR)[] | null {
  const args: (ValueIR | LambdaIR | RenderArgIR)[] = [];
  for (let i = 0; i < argumentNodes.length; i++) {
    const argument = unwrapExpression(argumentNodes[i]);
    if (argument === null || argument === undefined) {
      return null;
    }
    if (argument.type === 'SpreadElement') {
      return null;
    }
    const isFn =
      argument.type === 'ArrowFunctionExpression' || argument.type === 'FunctionExpression';
    if ((i === lambdaAt || pluginArgs) && isFn) {
      const lambda = lowerLambda(argument, facts);
      if (lambda !== null) {
        args.push(lambda);
        continue;
      }
      if (pluginArgs && facts.allowRenderArgs === true) {
        // render-bodied callback: a range placeholder the plan emitter resolves against
        // the value's embedded renders — or fails the whole lowering if none matches
        const range = getRange(argument);
        const params = lambdaParams(argument, facts);
        if (range !== null && params !== null) {
          args.push({ kind: 'render-arg', params, range: [range[0], range[1]] });
          continue;
        }
      }
      return null;
    }
    const value = lowerValueIr(argument, facts);
    if (value === null) {
      return null;
    }
    args.push(value);
  }
  return args;
}

function lambdaParams(
  node: AstNode,
  facts: ExprLowerFacts
): { name: string; binding: BindingId | null }[] | null {
  const arrow = node as { params: unknown[]; async?: boolean; generator?: boolean };
  if (arrow.async === true || arrow.generator === true) {
    return null;
  }
  const params: { name: string; binding: BindingId | null }[] = [];
  for (const param of arrow.params) {
    const name = getIdentifierName(param);
    if (name === null) {
      return null; // destructuring/defaults/rest stay unsupported (specs/02 v1)
    }
    params.push({ name, binding: facts.bindingIdAt(getRange(param)) });
  }
  return params;
}

function lowerLambda(node: AstNode, facts: ExprLowerFacts): LambdaIR | null {
  const arrow = node as { body: unknown };
  const params = lambdaParams(node, facts);
  if (params === null) {
    return null;
  }
  const body = unwrapExpression(arrow.body) ?? arrow.body;
  const bodyExpression = singleReturnExpression(body as AstNode) ?? body;
  const lowered = lowerValueIr(bodyExpression as AstNode, facts);
  return lowered === null ? null : { kind: 'lambda', params, body: lowered };
}

function singleReturnExpression(body: AstNode): AstNode | null {
  if (body.type !== 'BlockStatement') {
    return null;
  }
  const statements = (body as { body: unknown[] }).body;
  if (statements.length !== 1) {
    return null;
  }
  const statement = statements[0] as AstNode & { argument?: unknown };
  if (statement.type !== 'ReturnStatement' || statement.argument == null) {
    return null;
  }
  return statement.argument as AstNode;
}

function objectKeyName(key: unknown): string | null {
  const node = key as AstNode | undefined;
  if (node === undefined) {
    return null;
  }
  const identifier = getIdentifierName(node);
  if (identifier !== null) {
    return identifier;
  }
  if (node.type === 'Literal') {
    const value = (node as { value: unknown }).value;
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
  }
  return null;
}

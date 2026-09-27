/**
 * `native$(impl, targets)` collection.
 *
 * The marker is build-time only: the JS implementation stays the module's export — it is what runs
 * in the browser and in the JS SSR engine — while the per-target sources ride the plan so a native
 * engine can call the function without a JS runtime. Assembly replaces the call with the
 * implementation, so nothing about the marker reaches the emitted module.
 */
import { NativeTargetKind, type ModulePlan, type Range } from '../schema';
import { InvalidModuleError } from '../errors';
import { QwikMarker } from '../words';
import { isNode, type WalkableNode } from './ast/ast-types';
import { identifierName, isFunctionLike, unwrapExpression } from './ast/utils';
import type { LowerContext } from './lower-context';
import { pushPayload } from './lower-context';
import { recordPayloadQrls } from './lower-function';
import type { CallExpression, Node } from 'oxc-parser';

export interface NativeMarkerSite {
  native: number;
  /** Spans the assembly replaces, so a reference inside them retains no authored import. */
  replacedRanges: Range[];
}

/** Records every `native$` call in `statements`; the caller keeps its ranges out of helper roots. */
export function lowerNativeMarkers(
  statements: readonly Node[],
  ctx: LowerContext
): NativeMarkerSite[] {
  const sites: NativeMarkerSite[] = [];
  for (const call of findNativeCalls(statements, ctx)) {
    sites.push(lowerNativeMarker(call, ctx));
  }
  return sites;
}

function lowerNativeMarker(call: CallExpression, ctx: LowerContext): NativeMarkerSite {
  const [first, second] = call.arguments;
  const implementation =
    first === undefined || first.type === 'SpreadElement' ? null : unwrapExpression(first);
  if (implementation === null || !isFunctionLike(implementation)) {
    throw new InvalidModuleError(
      'native-implementation',
      'native$() needs an inline function as its implementation.',
      [call.start, call.end]
    );
  }
  const targetsNode =
    second === undefined || second.type === 'SpreadElement' ? null : unwrapExpression(second);
  const payload = pushPayload(ctx, [implementation.start, implementation.end]);
  recordPayloadQrls(ctx, payload, implementation);
  const declarator = ctx.bindings.parentOf(call);
  const binding =
    declarator?.type === 'VariableDeclarator' ? ctx.bindings.declaration(declarator.id) : null;
  ctx.plan.natives.push({
    name: (declarator?.type === 'VariableDeclarator' ? identifierName(declarator.id) : null) ?? '',
    binding,
    markerRange: [call.start, call.end],
    jsImplementation: payload,
    targets: readTargets(targetsNode, call, ctx),
  });
  return {
    native: ctx.plan.natives.length - 1,
    // Everything but the implementation goes: the callee and the targets it was declared with.
    replacedRanges: [
      [call.start, implementation.start],
      [implementation.end, call.end],
    ],
  };
}

function readTargets(
  node: Node | null,
  call: CallExpression,
  ctx: LowerContext
): ModulePlan['natives'][number]['targets'] {
  if (node === null || node.type !== 'ObjectExpression') {
    throw new InvalidModuleError(
      'native-targets',
      'native$() needs an object literal of target implementations.',
      [call.start, call.end]
    );
  }
  const targets: ModulePlan['natives'][number]['targets'] = {};
  for (const property of node.properties) {
    const name = property.type === 'Property' ? identifierName(property.key) : null;
    if (name === null) {
      throw new InvalidModuleError(
        'native-targets',
        'A native target needs a plain name and a nativeFrom()/nativeCode`` value.',
        [property.start, property.end]
      );
    }
    targets[name] = readTarget(unwrapExpression((property as { value: Node }).value), ctx);
  }
  return targets;
}

function readTarget(
  value: Node | null,
  ctx: LowerContext
): ModulePlan['natives'][number]['targets'][string] {
  const marker = value === null ? null : coreMarker(value, ctx);
  if (value !== null && marker === QwikMarker.NativeFrom) {
    const argument = unwrapExpression((value as CallExpression).arguments[0]);
    if (argument?.type === 'Literal' && typeof argument.value === 'string') {
      return { kind: NativeTargetKind.Path, path: argument.value };
    }
  }
  if (value !== null && marker === QwikMarker.NativeCode) {
    const quasi = (value as { quasi?: { quasis: { value: { raw: string } }[] } }).quasi;
    if (quasi !== undefined && quasi.quasis.length === 1) {
      return { kind: NativeTargetKind.Source, raw: quasi.quasis[0].value.raw };
    }
  }
  throw new InvalidModuleError(
    'native-targets',
    'A native target reads statically: nativeFrom("./path") or nativeCode`source` without interpolation.',
    value === null ? [0, 0] : [value.start, value.end]
  );
}

/** A tagged template's tag and a call's callee both name the marker. */
function coreMarker(node: Node, ctx: LowerContext): string | undefined {
  const callee =
    node.type === 'CallExpression'
      ? node.callee
      : node.type === 'TaggedTemplateExpression'
        ? node.tag
        : null;
  if (callee === null) {
    return undefined;
  }
  const binding = ctx.bindings.reference(callee);
  return binding === null ? undefined : ctx.coreBindings.get(binding);
}

function findNativeCalls(nodes: readonly Node[], ctx: LowerContext): CallExpression[] {
  const found: CallExpression[] = [];
  const visit = (current: unknown): void => {
    if (!isNode(current)) {
      (Array.isArray(current) ? current : []).forEach(visit);
      return;
    }
    if (current.type === 'CallExpression' && coreMarker(current, ctx) === QwikMarker.Native) {
      found.push(current);
      return;
    }
    Object.keys(current).forEach(
      (key) => key !== 'parent' && visit((current as WalkableNode)[key])
    );
  };
  visit(nodes);
  return found;
}

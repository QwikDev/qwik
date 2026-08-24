import {
  BoundaryKind,
  FnBodyKind,
  HandlerKind,
  OpKind,
  PropKind,
  QrlBodyKind,
  QrlPayloadKind,
  ValueKind,
  type ModulePlan,
  type Op,
  type Prop,
  type QrlUse,
} from '../schema';
import type { AstNode } from './ast/ast-types';
import { isNode } from './ast/ast-types';
import { normalizeAttributeName, VOID_ELEMENTS } from '../html';
import { InvalidModuleError, UnsupportedError } from '../errors';
import {
  createSegmentSourceIdentity,
  createSegmentSymbolName,
  sanitizeSegmentName,
} from '../segment-identity';
import { eventScopeName } from './events';

/** Module-wide lowering state: segment ordinals are authored-order across all components. */
export interface LowerContext {
  plan: ModulePlan;
  /** File basename without extension — the segment display-name prefix. */
  sourceName: string;
  sourceIdentity: string;
  segmentCounter: { next: number };
  bindingNames: ReadonlySet<string>;
  /** The current component's props param name. */
  propsParamName: string | null;
}

export function createLowerContext(
  plan: ModulePlan,
  path: string,
  scope: string | undefined
): LowerContext {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const basename = slash === -1 ? path : path.slice(slash + 1);
  return {
    plan,
    sourceName: basename.replace(/\.[cm]?[jt]sx?$/, ''),
    sourceIdentity: createSegmentSourceIdentity(path, scope),
    segmentCounter: { next: 0 },
    bindingNames: new Set(plan.bindings.map((binding) => binding.name)),
    propsParamName: null,
  };
}

/**
 * Lowers a JSX render tree to structural ops. Text stays RAW in the plan — each generator folds
 * with its own escaping (SSR streams raw, CSR templates escape). Dynamic arms land per example.
 */
export function lowerJsx(element: AstNode, ctx: LowerContext): Op {
  const opening = element.openingElement as AstNode;
  const nameNode = opening.name as AstNode & { name?: string };
  if (nameNode.type !== 'JSXIdentifier' || !/^[a-z]/.test(String(nameNode.name))) {
    throw new UnsupportedError('a non-native JSX tag');
  }
  const tag = String(nameNode.name);
  const props = (opening.attributes as AstNode[]).map((attribute) =>
    lowerAttribute(attribute, ctx)
  );
  const children: Op[] = [];
  for (const child of (element.children as AstNode[]) ?? []) {
    const lowered = lowerChild(child, ctx);
    if (lowered !== null) {
      children.push(lowered);
    }
  }
  if (VOID_ELEMENTS.has(tag) && children.length > 0) {
    throw new InvalidModuleError(
      'invalid-void-children',
      `The void element <${tag}> cannot have children.`,
      [element.start, element.end]
    );
  }
  return {
    op: OpKind.Element,
    tag,
    void: VOID_ELEMENTS.has(tag),
    styleScopedId: null,
    runtimeScope: false,
    props,
    propsEffect: null,
    children,
  };
}

function lowerChild(child: AstNode, ctx: LowerContext): Op | null {
  switch (child.type) {
    case 'JSXText': {
      const text = normalizeJsxText(String(child.value));
      return text === '' ? null : { op: OpKind.Static, html: text };
    }
    case 'JSXElement':
      return lowerJsx(child, ctx);
    case 'JSXExpressionContainer': {
      // `{/* comment */}` renders nothing; real expressions are dynamic holes, not static HTML.
      if ((child.expression as AstNode).type === 'JSXEmptyExpression') {
        return null;
      }
      throw new UnsupportedError('a dynamic JSX child expression');
    }
    default:
      throw new UnsupportedError(`JSX child ${child.type}`);
  }
}

function lowerAttribute(attribute: AstNode, ctx: LowerContext): Prop {
  if (attribute.type !== 'JSXAttribute') {
    throw new UnsupportedError('a JSX spread attribute');
  }
  const nameNode = attribute.name as AstNode & { name?: string };
  if (nameNode.type !== 'JSXIdentifier') {
    throw new UnsupportedError('a namespaced JSX attribute');
  }
  const authored = String(nameNode.name);
  const scope = eventScopeName(authored);
  if (scope !== null) {
    return lowerEventAttribute(attribute, ctx, authored, scope);
  }
  const value = attribute.value;
  if (
    value != null &&
    !(isNode(value) && value.type === 'Literal' && typeof value.value === 'string')
  ) {
    throw new UnsupportedError('a dynamic JSX attribute value');
  }
  return {
    k: PropKind.Static,
    name: normalizeAttributeName(authored),
    // Absent authored value = bare attribute (`<main hidden>`).
    value: value == null ? true : (value.value as string),
  };
}

function lowerEventAttribute(
  attribute: AstNode,
  ctx: LowerContext,
  authored: string,
  scope: string
): Prop {
  const value = attribute.value;
  if (!isNode(value) || value.type !== 'JSXExpressionContainer') {
    throw new UnsupportedError('an event attribute without a handler expression');
  }
  const fn = value.expression as AstNode;
  if (fn.type !== 'ArrowFunctionExpression') {
    throw new UnsupportedError('an event handler that is not an inline arrow function');
  }
  const params = fn.params as AstNode[];
  if (params.some((param) => param.type !== 'Identifier')) {
    throw new UnsupportedError('event handler parameters beyond identifiers');
  }
  const body = fn.body as AstNode;
  if (body.type === 'BlockStatement') {
    throw new UnsupportedError('a block-bodied event handler');
  }
  guardAgainstCaptures(body, ctx, params);

  ctx.plan.payloads.push({
    range: [fn.start, fn.end],
    constants: [],
    qrls: [],
    reads: [],
    awaits: [],
    useIds: [],
    renders: [],
    temps: [],
  });
  const ordinal = ctx.segmentCounter.next++;
  const id = `segment_${ordinal}`;
  const displayName = sanitizeSegmentName(`${ctx.sourceName}_${scope}_${id}`);
  ctx.plan.qrls.push({
    id,
    parent: null,
    name: createSegmentSymbolName(ctx.sourceIdentity, displayName, 'extracted'),
    ctxName: authored,
    boundary: { kind: BoundaryKind.Implicit, role: 'event' },
    markerAttributes: [],
    payloadKind: QrlPayloadKind.Function,
    authoredAsync: fn.async === true,
    body: { b: QrlBodyKind.Js, payload: ctx.plan.payloads.length - 1 },
    formals: [],
    params: { authored: params.length, used: [], sources: [] },
    origin: {
      range: [attribute.start, attribute.end],
      functionRange: [fn.start, fn.end],
      calleeRange: null,
      argumentRanges: [],
      paramRanges: params.map((param) => [param.start, param.end] as [number, number]),
      bodyRange: [body.start, body.end],
      bodyKind: FnBodyKind.Expression,
    },
    propsParts: [],
  });
  const use: QrlUse = { qrl: id, actuals: [] };
  return {
    k: PropKind.Event,
    name: scope,
    passive: false,
    handlers: [{ h: HandlerKind.Value, value: { v: ValueKind.Qrl, use } }],
  };
}

/**
 * A handler referencing outer bindings would emit a chunk that references names absent from the
 * chunk module — silently broken at runtime. Refuse until captures land.
 */
function guardAgainstCaptures(body: AstNode, ctx: LowerContext, params: AstNode[]): void {
  const local = new Set(params.map((param) => String((param as AstNode & { name: string }).name)));
  const visit = (node: unknown, parent: AstNode | null, key: string | null): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item, parent, key);
      }
      return;
    }
    if (!isNode(node)) {
      return;
    }
    if (node.type === 'Identifier') {
      const isMemberProperty =
        parent?.type === 'MemberExpression' && key === 'property' && parent.computed !== true;
      const isPropertyKey =
        parent?.type === 'Property' && key === 'key' && parent.computed !== true;
      if (!isMemberProperty && !isPropertyKey) {
        const name = String((node as AstNode & { name: string }).name);
        if (!local.has(name) && (ctx.bindingNames.has(name) || name === ctx.propsParamName)) {
          throw new UnsupportedError(`an event handler capturing "${name}"`);
        }
      }
      return;
    }
    for (const childKey of Object.keys(node)) {
      if (
        childKey === 'type' ||
        childKey === 'start' ||
        childKey === 'end' ||
        childKey === 'range'
      ) {
        continue;
      }
      visit(node[childKey], node, childKey);
    }
  };
  visit(body, null, null);
}

/** JSX whitespace normalization: whole-whitespace lines vanish, interior runs join with one space. */
export function normalizeJsxText(value: string): string {
  if (!value.includes('\n') && !value.includes('\r')) {
    return value;
  }
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  let lastNonEmptyLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/[^ \t]/.test(lines[i])) {
      lastNonEmptyLine = i;
    }
  }
  if (lastNonEmptyLine === -1) {
    return '';
  }
  let text = '';
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/\t/g, ' ');
    if (i !== 0) {
      line = line.replace(/^ +/, '');
    }
    if (i !== lines.length - 1) {
      line = line.replace(/ +$/, '');
    }
    if (line) {
      text += line;
      if (i !== lastNonEmptyLine) {
        text += ' ';
      }
    }
  }
  return text;
}

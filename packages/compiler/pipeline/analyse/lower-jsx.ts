import type {
  JSXAttribute,
  Expression,
  JSXAttributeItem,
  JSXChild,
  JSXElement,
  JSXIdentifier,
  JSXMemberExpression,
  Node,
} from 'oxc-parser';
import {
  ResumeKind,
  Shape,
  BoundaryKind,
  ComponentPropsKind,
  ComponentTargetKind,
  ExprKind,
  FnBodyKind,
  HandlerKind,
  LifetimeCommit,
  LifetimeOwner,
  OpKind,
  ProjectionKind,
  PropKind,
  PropsPartKind,
  ProgramBodyKind,
  QrlBodyKind,
  QrlPayloadKind,
  SeedKind,
  ValueKind,
  type LocalId,
  type Op,
  type Prop,
  type Qrl,
  type Seed,
  type QrlUse,
} from '../schema';
import { normalizeJsxText } from './ast/jsx-text';
import {
  escapeText,
  NEWLINE_EATING_ELEMENTS,
  normalizeAttributeName,
  RAW_TEXT_ELEMENTS,
  RCDATA_ELEMENTS,
  VOID_ELEMENTS,
  inferredNamespace,
} from '../html';
import { InvalidModuleError, UnsupportedError } from '../errors';
import { isFullyStaticSubtree } from '../static-subtree';
import { eventModifierName, eventScopeName, passiveEventNames, PASSIVE_PREFIX } from './events';
import { lowerEventAttribute, qrlAttributeExpression } from './lower-event';
import { lowerText } from './lower-hole';
import { checkDomNesting } from './dom-nesting';
import { lowerBranch, type BranchArm } from './lower-branch';
import { identifierName, isFunctionLike, jsxAttributeName, unwrapExpression } from './ast/utils';
import { JsxValueKind, type JsxValue } from './ast/jsx-analysis';
import {
  lowerComputedExpressionValue,
  lowerExpressionValue,
  tryLowerExprIr,
  lowerInlineExpressionValue,
  lowerTemplateValue,
  recordPayloadJsx,
  recordPayloadReads,
  trySignalReadValue,
} from './lower-expr';
import type { LowerContext } from './lower-context';
import { pushPayload, pushQrl, QrlIdentityKind } from './lower-context';
import { lowerArray } from './lower-array';
import {
  createCapturedContext,
  collectCaptures,
  lowerCaptures,
  type LoweredCaptures,
} from './ast/capture-analysis';
import { LocalKind } from './locals';
import { ValueIrKind, type ValueIR } from '../../src/expr-ir';
import { QRL_SUFFIX, QwikDirective, SegmentContext } from '../words';
import { lowerFunctionQrl, lowerQrlArgument, type QrlArgumentBoundary } from './lower-function';

/**
 * Lowers a JSX render tree to structural ops. Text stays RAW in the plan — each generator folds
 * with its own escaping (SSR streams raw, CSR templates escape). Dynamic arms land per example.
 */
function requireComponentBinding(node: JSXIdentifier, ctx: LowerContext): LocalId {
  const binding = ctx.bindings.reference(node);
  if (binding === null) {
    throw new InvalidModuleError(
      'unresolved-component',
      `The component "${node.name}" is not declared in this scope.`,
      [node.start, node.end]
    );
  }
  return binding;
}

/** `<UI.Button />` reads a member chain whose root is a binding. */
function jsxMemberIr(node: JSXMemberExpression, ctx: LowerContext): ValueIR {
  const object = node.object;
  const obj: ValueIR =
    object.type === 'JSXMemberExpression'
      ? jsxMemberIr(object, ctx)
      : { kind: ValueIrKind.BindingRead, binding: requireComponentBinding(object, ctx) };
  return { kind: ValueIrKind.Member, obj, name: node.property.name };
}

/** A tag bound to a live alias (`const Tag = props.as`) reads like a member tag. */
function aliasTagTarget(tag: JSXIdentifier, ctx: LowerContext) {
  const binding = ctx.bindings.reference(tag);
  const local = binding === null ? undefined : ctx.locals.get(binding);
  return local?.kind === LocalKind.PropMember ? { value: local.read, root: local.binding } : null;
}

/** The enclosing foreign namespace, omitted from the op when there is none. */
function tagNamespace(namespace: 'svg' | 'math' | null): { namespace?: 'svg' | 'math' } {
  return namespace === null ? {} : { namespace };
}

/** A tag read from props or a setup local can change; a module object is fixed. */
function lowerDynamicTag(
  element: JSXElement,
  attributes: readonly JSXAttributeItem[],
  value: ValueIR,
  root: LocalId,
  ctx: LowerContext
): Op {
  const target = { t: ComponentTargetKind.Dynamic, value, ...tagNamespace(ctx.namespace) } as const;
  const lower = () => lowerComponentOp(element, attributes, target, ctx);
  if (!ctx.locals.has(root) && root !== ctx.propsBinding) {
    return lower();
  }
  return lowerContentRange(
    element,
    [element],
    ctx,
    'a dynamic tag',
    SegmentContext.DynamicTag,
    LifetimeOwner.DynamicValue,
    () => ({
      ops: [lower()],
      id: { kind: SeedKind.Content, ordinal: ctx.contentCounter.next++ },
    })
  );
}

function jsxMemberRoot(node: JSXMemberExpression): JSXIdentifier {
  return node.object.type === 'JSXMemberExpression' ? jsxMemberRoot(node.object) : node.object;
}

export function lowerJsx(element: JSXElement, ctx: LowerContext): Op {
  const opening = element.openingElement;
  const nameNode = opening.name;
  if (nameNode.type !== 'JSXIdentifier' && nameNode.type !== 'JSXMemberExpression') {
    throw new UnsupportedError('a non-native JSX tag');
  }
  const attributes = opening.attributes.filter((attribute) => !isKeyAttribute(attribute));
  if (nameNode.type === 'JSXMemberExpression') {
    const root = requireComponentBinding(jsxMemberRoot(nameNode), ctx);
    return lowerDynamicTag(element, attributes, jsxMemberIr(nameNode, ctx), root, ctx);
  }
  const alias = aliasTagTarget(nameNode, ctx);
  if (alias !== null) {
    return lowerDynamicTag(element, attributes, alias.value, alias.root, ctx);
  }
  if (/^[A-Z]/.test(nameNode.name)) {
    const binding = requireComponentBinding(nameNode, ctx);
    return ctx.coreBindings.get(binding) === 'Slot'
      ? lowerSlotMarker(element, ctx)
      : lowerComponentOp(
          element,
          attributes,
          { t: ComponentTargetKind.Raw, binding, ...tagNamespace(ctx.namespace) },
          ctx
        );
  }
  if (!/^[a-z]/.test(nameNode.name)) {
    throw new UnsupportedError('a non-native JSX tag');
  }
  const tag = nameNode.name;
  const expanded = attributes.flatMap(expandLiteralSpread);
  const passiveEvents = passiveEventNames(expanded);
  // Any remaining spread makes the whole attribute list one runtime props object.
  const propsEffect = expanded.some((attribute) => attribute.type === 'JSXSpreadAttribute')
    ? lowerPropsChunk(expanded, ctx, null, QrlPayloadKind.Value)
    : null;
  const props =
    propsEffect === null
      ? expanded.flatMap((attribute) => {
          const name = attribute.type === 'JSXAttribute' ? jsxAttributeName(attribute) : null;
          if (name === QwikDirective.BindValue || name === QwikDirective.BindChecked) {
            return lowerBinding(attribute as JSXAttribute, ctx);
          }
          const prop = lowerAttribute(attribute, ctx, 'element', passiveEvents);
          return prop === null ? [] : [prop];
        })
      : [];
  const styleScopedId = ctx.styleScopes.length === 0 ? null : ctx.styleScopes.join(' ');
  if (styleScopedId !== null) {
    scopeStaticClass(props, styleScopedId);
  }
  checkDomNesting(tag, ctx.elementStack, [element.start, element.end]);
  const namespace = ctx.namespace;
  // Projected content is authored outside its host: an svg-only tag implies the svg namespace.
  const elementNamespace = namespace ?? inferredNamespace(tag);
  // `svg` and `math` open a namespace; `foreignObject` returns to HTML for its subtree.
  ctx.namespace =
    tag === 'svg' || tag === 'math' ? tag : tag === 'foreignObject' ? null : elementNamespace;
  ctx.elementStack.push(tag);
  const children = lowerFormValue(
    tag,
    props,
    expanded,
    lowerContentChildren(tag, element.children, ctx),
    ctx
  );
  ctx.elementStack.pop();
  ctx.namespace = namespace;
  if (VOID_ELEMENTS.has(tag) && children.length > 0) {
    throw new InvalidModuleError(
      'invalid-void-children',
      `The void element <${tag}> cannot have children.`,
      [element.start, element.end]
    );
  }
  // Doubling the newline the parser eats keeps the authored one in the server and template markup.
  const first = children[0];
  if (NEWLINE_EATING_ELEMENTS.has(tag) && first?.op === OpKind.Static && first.html[0] === '\n') {
    first.html = '\n' + first.html;
  }
  // A declarative shadow root moves the content into the host; any other template keeps it inert.
  const isInertTemplate =
    tag === 'template' &&
    !props.some(
      (prop) => prop.k === PropKind.Static && prop.name.toLowerCase() === 'shadowrootmode'
    );
  if (isInertTemplate && !children.every(isFullyStaticSubtree)) {
    throw new InvalidModuleError(
      'template-content',
      '<template> content must be static: the parser stores it in a fragment resume never reaches.',
      [element.start, element.end]
    );
  }
  return {
    op: OpKind.Element,
    tag,
    void: VOID_ELEMENTS.has(tag),
    ...tagNamespace(elementNamespace),
    styleScopedId,
    runtimeScope: false,
    props,
    propsEffect,
    children,
  };
}

/**
 * Browsers ignore `value` markup on textarea and select. The prop stays for the client property
 * binding; the server gets the value as textarea content or as `selected` on the matching option,
 * rendered once from an inline value.
 */
function lowerFormValue(
  tag: string,
  props: Prop[],
  attributes: readonly JSXAttributeItem[],
  children: Op[],
  ctx: LowerContext
): Op[] {
  const prop = props.find(
    (prop): prop is Extract<Prop, { k: PropKind.Static | PropKind.Dynamic }> =>
      (prop.k === PropKind.Static || prop.k === PropKind.Dynamic) && prop.name === 'value'
  );
  if (prop === undefined || (tag !== 'textarea' && tag !== 'select')) {
    return children;
  }
  // A literal value folds into markup; nothing is left for the client to bind.
  if (prop.k === PropKind.Static) {
    props.splice(props.indexOf(prop), 1);
  }
  const attribute = attributes.find((attribute) => {
    const name = attribute.type === 'JSXAttribute' ? jsxAttributeName(attribute) : null;
    return name === QwikDirective.Value || name === QwikDirective.BindValue;
  }) as JSXAttribute;
  const expression = prop.k === PropKind.Dynamic ? qrlAttributeExpression(attribute) : null;
  // A signal read keeps its IR so the once-only value stays a plain `sig.value`.
  const read = expression === null ? null : trySignalReadValue(expression, ctx);
  const ir =
    read?.expr.kind === ExprKind.Ir && read.expr.ir.kind === ValueIrKind.SignalRead
      ? read.expr.ir
      : expression === null
        ? null
        : tryLowerExprIr(expression, ctx);
  if (tag === 'textarea') {
    if (expression === null) {
      return [
        {
          op: OpKind.Static,
          html: escapeText(String(prop.k === PropKind.Static ? prop.value : '')),
        },
      ];
    }
    const value = lowerInlineExpressionValue(
      expression,
      ctx,
      collectCaptures(expression, ctx, new Set())
    );
    return [
      {
        op: OpKind.Hole,
        value: ir === null ? value : { ...value, expr: { kind: ExprKind.Ir, ir } },
        shape: Shape.Text,
        effect: null,
        // A textarea's content is text whatever the value's inferred kind.
        stringify: true,
      },
    ];
  }
  for (const option of children) {
    if (option.op !== OpKind.Element || option.tag !== 'option') {
      continue;
    }
    const optionValue = option.props.find(
      (prop) => prop.k === PropKind.Static && prop.name === 'value'
    );
    if (optionValue?.k !== PropKind.Static || typeof optionValue.value !== 'string') {
      continue;
    }
    if (prop.k === PropKind.Static) {
      if (prop.value === optionValue.value) {
        option.props.push({ k: PropKind.Static, name: 'selected', value: true });
      }
    } else if (ir !== null) {
      const selected: ValueIR = {
        kind: ValueIrKind.Bin,
        op: '===',
        left: ir,
        right: { kind: ValueIrKind.Lit, value: optionValue.value },
      };
      option.props.push({
        k: PropKind.Dynamic,
        name: 'selected',
        value: {
          v: ValueKind.Computed,
          expr: { kind: ExprKind.Ir, ir: selected },
          resume: { r: ResumeKind.Inline },
          compilerString: false,
        },
        effect: null,
      });
    }
  }
  return children;
}

/** `bind:value={sig}` is `value={sig.value}` plus an input handler writing back through the runtime. */
function lowerBinding(attribute: JSXAttribute, ctx: LowerContext): Prop[] {
  const expression = qrlAttributeExpression(attribute);
  const signal = expression?.type === 'Identifier' ? ctx.bindings.reference(expression) : null;
  const value = expression === null ? null : trySignalReadValue(expression, ctx);
  if (signal === null || value === null || ctx.locals.get(signal)?.kind !== LocalKind.Signal) {
    throw new UnsupportedError('a two-way binding to a non-signal');
  }
  const checked = jsxAttributeName(attribute) === QwikDirective.BindChecked;
  return [
    { k: PropKind.Dynamic, name: checked ? 'checked' : 'value', value, effect: null },
    {
      k: PropKind.Event,
      name: eventScopeName('onInput$')!,
      passive: false,
      handlers: [{ h: HandlerKind.Bind, signal, checked }],
    },
  ];
}

/** `ref={x}` applies once when the element exists: a function is called, a signal receives it. */
function lowerRef(attribute: JSXAttribute, ctx: LowerContext): Prop | null {
  const expression = qrlAttributeExpression(attribute);
  if (expression === null) {
    return null;
  }
  return {
    k: PropKind.Ref,
    value: lowerInlineExpressionValue(expression, ctx, collectCaptures(expression, ctx, new Set())),
  };
}

/** `dangerouslySetInnerHTML` is element content: a literal folds, anything else patches innerHTML. */
function lowerInnerHtml(attribute: JSXAttribute, ctx: LowerContext): Prop | null {
  const value = attribute.value;
  const expression =
    value?.type === 'JSXExpressionContainer'
      ? value.expression.type === 'JSXEmptyExpression'
        ? null
        : value.expression
      : (value ?? null);
  if (expression === null) {
    return null;
  }
  return {
    k: PropKind.InnerHtml,
    value:
      expression.type === 'Literal'
        ? lowerInlineExpressionValue(expression, ctx, collectCaptures(expression, ctx, new Set()))
        : lowerExpressionValue(expression, ctx, QwikDirective.InnerHtml),
    effect: null,
  };
}

/** An inline handler array needs each element extracted, so it stays on the event path. */
function isHandlerList(expression: Expression): boolean {
  return (
    expression.type === 'ArrayExpression' &&
    expression.elements.some((element) => element !== null && isFunctionLike(element))
  );
}

/** `{...{ a: x, b }}` is the attributes `a={x} b={b}`; any other spread stays a spread. */
function expandLiteralSpread(attribute: JSXAttributeItem): JSXAttributeItem[] {
  const object =
    attribute.type === 'JSXSpreadAttribute' ? unwrapExpression(attribute.argument) : null;
  if (object?.type !== 'ObjectExpression') {
    return [attribute];
  }
  const properties = object.properties.map((property): JSXAttributeItem | null => {
    if (property.type !== 'Property' || property.computed || property.method) {
      return null;
    }
    const key = property.key;
    const name =
      key.type === 'Literal' && typeof key.value === 'string'
        ? key.value
        : key.type === 'Identifier'
          ? key.name
          : null;
    if (name === null) {
      return null;
    }
    return {
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name, start: key.start, end: key.end },
      value:
        property.value.type === 'Literal'
          ? property.value
          : {
              type: 'JSXExpressionContainer',
              expression: property.value,
              start: property.value.start,
              end: property.value.end,
            },
      start: property.start,
      end: property.end,
    } as JSXAttributeItem;
  });
  return properties.every((property) => property !== null) ? properties : [attribute];
}

function lowerComponentProps(
  attributes: readonly JSXAttributeItem[],
  ctx: LowerContext,
  factoryChild: Expression | null
) {
  const onlyAttribute = attributes.length === 1 ? attributes[0] : null;
  if (factoryChild === null && onlyAttribute?.type === 'JSXSpreadAttribute') {
    const expression = unwrapExpression(onlyAttribute.argument);
    const binding = ctx.bindings.reference(expression);
    if (binding !== null && ctx.locals.get(binding)?.kind === LocalKind.PropRest) {
      return {
        c: ComponentPropsKind.Entries as const,
        props: [
          {
            k: PropKind.Spread as const,
            value: lowerInlineExpressionValue(
              expression,
              ctx,
              collectCaptures(expression, ctx, new Set())
            ),
            effect: null,
          },
        ],
      };
    }
  }
  if (
    attributes.some(
      (attribute) =>
        attribute.type === 'JSXSpreadAttribute' &&
        (trySignalReadValue(attribute.argument, ctx) !== null ||
          ctx.bindings
            .freeReferences(attribute.argument)
            .some(({ binding }) => ctx.locals.get(binding)?.kind === LocalKind.PropRest))
    )
  ) {
    return lowerComponentPropsProxy(attributes, ctx, factoryChild);
  }
  const props = attributes
    .map((attribute) => lowerAttribute(attribute, ctx, 'component'))
    .filter((prop) => prop !== null);
  if (factoryChild !== null) {
    props.push({
      k: PropKind.Dynamic,
      name: 'children',
      value: lowerComponentPropValue(factoryChild, ctx, 'children'),
      effect: null,
    });
  }
  return { c: ComponentPropsKind.Entries as const, props };
}

function lowerComponentPropsProxy(
  attributes: readonly JSXAttributeItem[],
  ctx: LowerContext,
  factoryChild: Expression | null
) {
  const compute = lowerPropsChunk(attributes, ctx, factoryChild, QrlPayloadKind.Function);
  return { c: ComponentPropsKind.Proxy as const, compute };
}

/** One chunk building the props object in authored order: spreads, values and QRL entries. */
function lowerPropsChunk(
  attributes: readonly JSXAttributeItem[],
  ctx: LowerContext,
  factoryChild: Expression | null,
  payloadKind: QrlPayloadKind
): QrlUse {
  const parts: Qrl['propsParts'] = [];
  const expressions: Expression[] = [];
  const payloads: number[] = [];
  const addExpression = (
    expression: Expression,
    part: { kind: PropsPartKind.Spread } | { kind: PropsPartKind.Expression; name: string }
  ) => {
    const payload = pushPayload(ctx, [expression.start, expression.end]);
    const factory =
      part.kind === PropsPartKind.Expression ? lowerPropFactory(expression, ctx, part.name) : null;
    if (factory === null) {
      recordPayloadJsx(ctx, payload, expression);
    } else {
      ctx.plan.payloads[payload].qrls.push({
        range: [expression.start, expression.end],
        use: factory,
      });
    }
    expressions.push(expression);
    payloads.push(payload);
    parts.push({ ...part, value: payload });
  };
  for (const attribute of attributes) {
    if (attribute.type === 'JSXSpreadAttribute') {
      addExpression(attribute.argument, { kind: PropsPartKind.Spread });
      continue;
    }
    const name = jsxAttributeName(attribute)!;
    if (name === QwikDirective.Slot) {
      continue;
    }
    const scope = eventScopeName(name);
    if (scope !== null) {
      const authored = qrlAttributeExpression(attribute);
      // A composed handler value (`cond ? [a, $(...)] : b`) is a plain entry; its markers extract.
      if (authored !== null && !isFunctionLike(authored) && !isHandlerList(authored)) {
        addExpression(authored, { kind: PropsPartKind.Expression, name });
        continue;
      }
      const lowered = lowerEventAttribute(attribute, ctx, name, scope);
      if (lowered === null) {
        continue;
      }
      const { event, expression } = lowered;
      const handler = event.handlers.length === 1 ? event.handlers[0] : null;
      if (
        handler?.h === HandlerKind.Value &&
        handler.value.v === ValueKind.Computed &&
        handler.value.resume.r === ResumeKind.Inline
      ) {
        addExpression(expression, { kind: PropsPartKind.Expression, name });
        continue;
      }
      if (handler?.h !== HandlerKind.Value || handler.value.v !== ValueKind.Qrl) {
        throw new UnsupportedError('a non-QRL component event handler');
      }
      expressions.push(expression);
      parts.push({ kind: PropsPartKind.Event, name, use: handler.value.use });
      continue;
    }
    if (name.endsWith(QRL_SUFFIX)) {
      const expression = qrlAttributeExpression(attribute);
      if (expression === null) {
        continue;
      }
      expressions.push(expression);
      parts.push({ kind: PropsPartKind.Event, name, use: lowerQrlProp(expression, ctx, name) });
      continue;
    }
    const value = attribute.value;
    if (value === null) {
      parts.push({ kind: PropsPartKind.Static, name, value: true });
    } else if (value.type === 'Literal') {
      parts.push({ kind: PropsPartKind.Static, name, value: value.value });
    } else if (value.type === 'JSXExpressionContainer') {
      if (value.expression.type === 'JSXEmptyExpression') {
        parts.push({ kind: PropsPartKind.Static, name, value: null });
      } else {
        addExpression(value.expression, { kind: PropsPartKind.Expression, name });
      }
    } else {
      throw new UnsupportedError('a dynamic JSX attribute value');
    }
  }
  if (factoryChild !== null) {
    addExpression(factoryChild, { kind: PropsPartKind.Expression, name: 'children' });
  }
  const { captures, args, refs } = lowerCaptures(expressions, ctx, 'component props');
  for (const payload of payloads) {
    recordPayloadReads(ctx, payload, refs);
  }
  const range: [number, number] = [attributes[0].start, attributes[attributes.length - 1].end];
  const { use } = pushQrl(
    ctx,
    {
      identity: { kind: QrlIdentityKind.Segment, nameCtx: 'props' },
      ctxName: 'props',
      boundary: { kind: BoundaryKind.Implicit, role: 'expression' },
      payloadKind,
      authoredAsync: false,
      body: {
        b: QrlBodyKind.Expr,
        expr: { kind: ExprKind.Js, payload: payloads[0] },
        initialOnly: false,
      },
      captures,
      params: { authored: 0, used: [], sources: [] },
      origin: {
        range,
        functionRange: range,
        calleeRange: null,
        argumentRanges: [],
        paramRanges: [],
        bodyRange: range,
        bodyKind: FnBodyKind.Expression,
      },
      propsParts: parts,
    },
    args
  );
  return use;
}

/**
 * Content the parser reads as one text node. Raw text is a literal, since a live value belongs to
 * `dangerouslySetInnerHTML`; RCDATA with several parts is one hole, as a marker would show as
 * text.
 */
function lowerContentChildren(tag: string, children: readonly JSXChild[], ctx: LowerContext): Op[] {
  const isRawText = RAW_TEXT_ELEMENTS.has(tag);
  if (!isRawText && !RCDATA_ELEMENTS.has(tag)) {
    return lowerJsxChildren(children, ctx);
  }
  const parts: (string | Expression)[] = [];
  for (const child of flattenJsxChildren(children, ctx)) {
    if (child.type === 'JSXText') {
      const text = normalizeJsxText(child.value);
      if (text !== '') {
        parts.push(text);
      }
    } else if (child.type !== 'JSXExpressionContainer') {
      throw new InvalidModuleError(
        'dom-nesting',
        `<${tag}> takes text only: the HTML parser would not build an element there.`,
        [child.start, child.end]
      );
    } else if (child.expression.type !== 'JSXEmptyExpression') {
      parts.push(child.expression);
    }
  }
  if (isRawText) {
    const text = parts.map((part) => (typeof part === 'string' ? part : rawTextLiteral(tag, part)));
    // Only `</` could end the element early; nothing else is decoded here.
    return text.length === 0
      ? []
      : [{ op: OpKind.Static, html: text.join('').replace(/<\//g, '<\\/') }];
  }
  if (parts.length < 2) {
    return lowerJsxChildren(children, ctx);
  }
  const range: [number, number] = [children[0].start, children[children.length - 1].end];
  return [
    {
      op: OpKind.Hole,
      value: lowerTemplateValue(parts, ctx, range),
      shape: Shape.Text,
      effect: null,
      stringify: true,
    },
  ];
}

function rawTextLiteral(tag: string, expression: Expression): string {
  const node = unwrapExpression(expression);
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  throw new InvalidModuleError(
    'raw-text-content',
    `<${tag}> takes a string literal; set dynamic content with dangerouslySetInnerHTML.`,
    [expression.start, expression.end]
  );
}

/** Lowers a JSX child list — the shared path for fragment-rooted trees. */
export function lowerJsxChildren(children: readonly JSXChild[], ctx: LowerContext): Op[] {
  return mergeStaticText(
    flattenJsxChildren(children, ctx).flatMap((child) => lowerChild(child, ctx))
  );
}

function mergeStaticText(ops: Op[]): Op[] {
  const merged: Op[] = [];
  for (const op of ops) {
    const previous = merged[merged.length - 1];
    if (previous?.op === OpKind.Static && op.op === OpKind.Static) {
      previous.html += op.html;
    } else {
      merged.push(op);
    }
  }
  return merged;
}

function flattenJsxChildren(children: readonly JSXChild[], ctx: LowerContext): JSXChild[] {
  return children.flatMap((child) => {
    const value = ctx.jsx.read(child);
    return value.kind === JsxValueKind.Fragment
      ? flattenJsxChildren(value.node.children, ctx)
      : [child];
  });
}

function lowerChild(child: JSXChild, ctx: LowerContext): Op[] {
  switch (child.type) {
    case 'JSXText': {
      const text = normalizeJsxText(child.value);
      return text === '' ? [] : [{ op: OpKind.Static, html: text }];
    }
    case 'JSXElement':
      return [lowerJsx(child, ctx)];
    case 'JSXExpressionContainer': {
      if (child.expression.type === 'JSXEmptyExpression') {
        return [];
      }
      // The parser would wrap dynamic rows in a `tbody` past the range markers.
      if (ctx.elementStack.at(-1) === 'table') {
        throw new InvalidModuleError(
          'dom-nesting',
          'Dynamic rows must sit inside <tbody>, <thead> or <tfoot>: the HTML parser would insert a body around them.',
          [child.start, child.end]
        );
      }
      return lowerRenderExpression(child.expression, ctx);
    }
    default:
      throw new UnsupportedError(`JSX child ${child.type}`);
  }
}

export function lowerRenderExpression(expression: Expression, ctx: LowerContext): Op[] {
  expression = unwrapExpression(expression);
  if (isPropsChildren(expression, ctx)) {
    return [createSlotOp(ctx)];
  }
  const value = ctx.jsx.read(expression);
  const branch = readRenderBranch(value);
  if (branch !== null) {
    return [
      lowerBranch(branch.test, branch.then, branch.else, ctx, (arm) =>
        lowerRenderExpression(arm, ctx)
      ),
    ];
  }
  switch (value.kind) {
    case JsxValueKind.Empty:
      if (expression.type !== 'Identifier' || ctx.bindings.reference(expression) === null) {
        return [];
      }
      break;
    case JsxValueKind.Element:
      return [lowerJsx(value.node, ctx)];
    case JsxValueKind.Fragment:
      return lowerJsxChildren(value.node.children, ctx);
    case JsxValueKind.Collection:
      return [lowerArray(value.node, ctx)];
  }
  // A literal array in render position is a fragment spelled differently.
  if (
    expression.type === 'ArrayExpression' &&
    expression.elements.every((element) => element !== null && element.type !== 'SpreadElement')
  ) {
    return expression.elements.flatMap((element) =>
      lowerRenderExpression(element as Expression, ctx)
    );
  }
  if (value.hasJsxValue) {
    const computed = lowerComputedExpressionValue(
      expression,
      ctx,
      'content',
      QrlPayloadKind.Function,
      'content'
    );
    const lifetime = ctx.plan.lifetimes.length;
    ctx.plan.lifetimes.push({
      id: lifetime,
      parent: 0,
      owner: LifetimeOwner.DynamicValue,
      commit: LifetimeCommit.AtomicRange,
    });
    return [
      {
        op: OpKind.Content,
        render: computed.resume.qrl,
        id: { kind: SeedKind.Content, ordinal: ctx.contentCounter.next++ },
        lifetime,
      },
    ];
  }
  return lowerText(expression, ctx);
}

function readRenderBranch(value: JsxValue) {
  if (value.kind === JsxValueKind.Conditional && value.hasJsxValue) {
    return {
      test: value.node.test,
      then: createBranchArm(value.node.consequent, value.then),
      else: createBranchArm(value.node.alternate, value.else),
    };
  }
  if (value.kind === JsxValueKind.Logical && value.node.operator === '&&') {
    return {
      test: value.node.left,
      then: createBranchArm(value.node.right, value.right),
      else: null,
    };
  }
  return null;
}

function createBranchArm(expression: Expression, value: JsxValue): BranchArm {
  return {
    expression: value.kind === JsxValueKind.Empty ? null : expression,
    range: [expression.start, expression.end],
  };
}

function lowerComponentOp(
  element: JSXElement,
  attributes: readonly JSXAttributeItem[],
  target: Extract<Op, { op: OpKind.Component }>['target'],
  ctx: LowerContext
): Op {
  const children = element.children.filter(isProjectionChild);
  const child = children.length === 1 ? children[0] : null;
  const factoryChild =
    child?.type === 'JSXExpressionContainer' &&
    child.expression.type !== 'JSXEmptyExpression' &&
    ctx.jsx.factory(child.expression) !== null
      ? child.expression
      : null;
  return {
    op: OpKind.Component,
    target,
    props: lowerComponentProps(attributes, ctx, factoryChild),
    projections: factoryChild === null ? lowerProjections(element.children, ctx) : [],
    id: { kind: SeedKind.Component, ordinal: ctx.componentCounter.next++ },
    lifetime: 0,
    blockingSuspense: false,
  };
}

function lowerSlotMarker(element: JSXElement, ctx: LowerContext): Op {
  const attributes = element.openingElement.attributes;
  const nameAttribute = attributes.find((attribute) => jsxAttributeName(attribute) === 'name');
  if (attributes.some((attribute) => attribute !== nameAttribute)) {
    throw new UnsupportedError('Slot attributes');
  }
  if (nameAttribute === undefined) {
    return createSlotOp(ctx, '', lowerSlotFallback(element.children, ctx));
  }
  const name = readSlotName(nameAttribute);
  return typeof name === 'string'
    ? createSlotOp(ctx, name, lowerSlotFallback(element.children, ctx))
    : lowerDynamicSlot(element, name, ctx);
}

/** A changing slot name owns one reactive render range. */
function lowerDynamicSlot(element: JSXElement, name: Expression, ctx: LowerContext): Op {
  return lowerContentRange(
    element,
    [name, ...element.children],
    ctx,
    'a dynamic slot',
    SegmentContext.DynamicSlot,
    LifetimeOwner.Slot,
    (captures) => {
      const slot = createSlotOp(ctx, '', lowerSlotFallback(element.children, ctx), {
        nameValue: lowerInlineExpressionValue(name, ctx, captures.refs),
      });
      return { ops: [slot], id: slot.id };
    }
  );
}

/** One render range re-rendered whenever a value its ops track changes. */
function lowerContentRange(
  element: JSXElement,
  captured: Node[],
  ctx: LowerContext,
  subject: string,
  nameCtx: SegmentContext,
  owner: LifetimeOwner,
  lowerOps: (captures: LoweredCaptures) => { ops: Op[]; id: Seed }
): Op {
  const captures = lowerCaptures(captured, ctx, subject);
  const lifetime = ctx.plan.lifetimes.length;
  ctx.plan.lifetimes.push({ id: lifetime, parent: 0, owner, commit: LifetimeCommit.AtomicRange });
  const program = ctx.plan.programs.length;
  ctx.plan.programs.push({
    body: { kind: ProgramBodyKind.Ops, ops: [] },
    setup: [],
    params: [],
    lifetime,
    needsId: false,
    async: false,
  });
  const range: [number, number] = [element.start, element.end];
  const { use } = pushQrl(
    ctx,
    {
      identity: { kind: QrlIdentityKind.Segment, nameCtx },
      ctxName: nameCtx,
      boundary: { kind: BoundaryKind.Implicit, role: nameCtx },
      payloadKind: QrlPayloadKind.Function,
      authoredAsync: false,
      body: { b: QrlBodyKind.Program, program },
      captures: captures.captures,
      params: { authored: 0, used: [], sources: [] },
      origin: {
        range,
        functionRange: range,
        calleeRange: null,
        argumentRanges: [],
        paramRanges: [],
        bodyRange: range,
        bodyKind: FnBodyKind.Expression,
      },
    },
    captures.args
  );
  const { ops, id } = lowerOps(captures);
  ctx.plan.programs[program].body = { kind: ProgramBodyKind.Ops, ops };
  return { op: OpKind.Content, render: use, id, lifetime };
}

function lowerSlotFallback(children: readonly JSXChild[], ctx: LowerContext): QrlUse | null {
  const fallbackChildren = flattenJsxChildren(children, ctx).filter(isProjectionChild);
  return fallbackChildren.length === 0
    ? null
    : lowerRenderQrl(
        fallbackChildren,
        ctx,
        'a slot fallback',
        SegmentContext.Projection,
        'slot-fallback',
        (renderContext) => lowerJsxChildren(fallbackChildren, renderContext)
      );
}

function createSlotOp(
  ctx: LowerContext,
  name = '',
  fallback: Extract<Op, { op: OpKind.Slot }>['fallback'] = null,
  options: Pick<Extract<Op, { op: OpKind.Slot }>, 'nameValue'> = {}
): Extract<Op, { op: OpKind.Slot }> {
  return {
    op: OpKind.Slot,
    name,
    ...options,
    fallback,
    id: { kind: SeedKind.Slot, ordinal: ctx.slotCounter.next++ },
  };
}

function isPropsChildren(node: Node, ctx: LowerContext): boolean {
  const expression = unwrapExpression(node);
  if (expression?.type === 'Identifier') {
    const binding = ctx.bindings.reference(expression);
    return binding !== null && ctx.propsMembers.get(binding) === 'children';
  }
  if (
    expression?.type !== 'MemberExpression' ||
    expression.computed ||
    identifierName(expression.property) !== 'children'
  ) {
    return false;
  }
  const object = unwrapExpression(expression.object);
  return (
    object?.type === 'Identifier' &&
    ctx.propsBinding !== null &&
    ctx.bindings.reference(object) === ctx.propsBinding
  );
}

function lowerProjections(
  children: readonly JSXChild[],
  ctx: LowerContext
): Extract<Op, { op: OpKind.Component }>['projections'] {
  return flattenJsxChildren(children, ctx)
    .filter(isProjectionChild)
    .flatMap((child) => {
      const names = [...new Set(collectProjectionNames(ctx.jsx.read(child)))];
      return names.map((name) => lowerProjection(child, name, ctx));
    });
}

function lowerProjection(
  child: JSXChild,
  name: string,
  ctx: LowerContext
): Extract<Op, { op: OpKind.Component }>['projections'][number] {
  const id = { kind: SeedKind.Projection, ordinal: ctx.projectionCounter.next++ } as const;
  const forwardedSlot = readForwardedSlot(child, ctx);
  if (forwardedSlot !== null) {
    return {
      kind: ProjectionKind.Forward,
      name,
      sourceName: forwardedSlot.sourceName,
      fallback: lowerSlotFallback(forwardedSlot.children, ctx),
      id,
    };
  }
  const use = lowerRenderQrl(
    [child],
    ctx,
    'a component projection',
    SegmentContext.Projection,
    'projection',
    (renderContext) => lowerProjectedChildren([child], name, renderContext)
  );
  return {
    kind: ProjectionKind.Render,
    name,
    use,
    id,
  };
}

function lowerProjectedChildren(
  children: readonly JSXChild[],
  name: string,
  ctx: LowerContext
): Op[] {
  return mergeStaticText(
    flattenJsxChildren(children, ctx).flatMap((child) => {
      if (!collectProjectionNames(ctx.jsx.read(child)).includes(name)) {
        return [];
      }
      if (
        child.type === 'JSXExpressionContainer' &&
        child.expression.type !== 'JSXEmptyExpression'
      ) {
        return lowerProjectedExpression(child.expression, name, ctx);
      }
      return lowerChild(child, ctx);
    })
  );
}

function lowerProjectedExpression(expression: Expression, name: string, ctx: LowerContext): Op[] {
  expression = unwrapExpression(expression);
  const value = ctx.jsx.read(expression);
  if (value.kind === JsxValueKind.Fragment) {
    return lowerProjectedChildren(value.node.children, name, ctx);
  }
  if (value.kind === JsxValueKind.Collection) {
    return [lowerArray(value.node, ctx, (row) => lowerProjectedExpression(row, name, ctx))];
  }
  const branch = readRenderBranch(value);
  if (branch !== null) {
    return [
      lowerBranch(
        branch.test,
        selectProjectionArm(branch.then, name, ctx),
        branch.else === null ? null : selectProjectionArm(branch.else, name, ctx),
        ctx,
        (arm) => lowerProjectedExpression(arm, name, ctx)
      ),
    ];
  }
  return lowerRenderExpression(expression, ctx);
}

function selectProjectionArm(arm: BranchArm, name: string, ctx: LowerContext): BranchArm {
  if (
    arm.expression === null ||
    collectProjectionNames(ctx.jsx.read(arm.expression)).includes(name)
  ) {
    return arm;
  }
  return { ...arm, expression: null };
}

function collectProjectionNames(value: JsxValue): string[] {
  switch (value.kind) {
    case JsxValueKind.Element:
      return [readProjectionName(value.node)];
    case JsxValueKind.Fragment:
      return value.children.flatMap(collectProjectionNames);
    case JsxValueKind.Empty:
      return [];
    case JsxValueKind.Text:
      return normalizeJsxText(value.node.value) === '' ? [] : [''];
    case JsxValueKind.Collection:
      if (value.row !== null) {
        return collectProjectionNames(value.row);
      }
      break;
    case JsxValueKind.Conditional:
      return [...collectProjectionNames(value.then), ...collectProjectionNames(value.else)];
    case JsxValueKind.Logical:
      if (value.node.operator === '&&') {
        return collectProjectionNames(value.right);
      }
  }
  return [''];
}

function readForwardedSlot(
  child: JSXChild,
  ctx: LowerContext
): { sourceName: string; children: readonly JSXChild[] } | null {
  if (child.type === 'JSXExpressionContainer' && isPropsChildren(child.expression, ctx)) {
    return { sourceName: '', children: [] };
  }
  if (child.type !== 'JSXElement' || child.openingElement.name.type !== 'JSXIdentifier') {
    return null;
  }
  const binding = ctx.bindings.reference(child.openingElement.name);
  if (binding === null || ctx.coreBindings.get(binding) !== 'Slot') {
    return null;
  }
  const attributes = child.openingElement.attributes;
  if (
    attributes.some((attribute) => {
      const name = jsxAttributeName(attribute);
      return name !== 'name' && name !== QwikDirective.Slot;
    })
  ) {
    return null;
  }
  const nameAttribute = attributes.find((attribute) => jsxAttributeName(attribute) === 'name');
  return {
    sourceName: nameAttribute === undefined ? '' : readStaticSlotName(nameAttribute),
    children: child.children,
  };
}

export function lowerRenderQrl(
  children: JSXChild[],
  ctx: LowerContext,
  subject: string,
  nameCtx: SegmentContext,
  role: string,
  lowerBody: (ctx: LowerContext) => Op[]
) {
  const range: [number, number] = [children[0].start, children[children.length - 1].end];
  const { captures, args } = lowerCaptures(children, ctx, subject);
  const program = ctx.plan.programs.length;
  ctx.plan.programs.push({
    body: { kind: ProgramBodyKind.Ops, ops: [] },
    setup: [],
    params: [],
    lifetime: 0,
    needsId: false,
    async: false,
  });
  const { use } = pushQrl(
    ctx,
    {
      identity: { kind: QrlIdentityKind.Segment, nameCtx },
      ctxName: nameCtx,
      boundary: { kind: BoundaryKind.Implicit, role },
      payloadKind: QrlPayloadKind.Function,
      authoredAsync: false,
      body: { b: QrlBodyKind.Program, program },
      captures,
      params: { authored: 0, used: [], sources: [] },
      origin: {
        range,
        functionRange: range,
        calleeRange: null,
        argumentRanges: [],
        paramRanges: [],
        bodyRange: range,
        bodyKind: FnBodyKind.Expression,
      },
    },
    args
  );
  ctx.plan.programs[program].body = {
    kind: ProgramBodyKind.Ops,
    ops: lowerBody(createCapturedContext(ctx, captures)),
  };
  return use;
}

function isProjectionChild(child: JSXChild): boolean {
  if (child.type === 'JSXText') {
    return normalizeJsxText(child.value) !== '';
  }
  return !(
    child.type === 'JSXExpressionContainer' && child.expression.type === 'JSXEmptyExpression'
  );
}

function readProjectionName(child: JSXChild): string {
  if (child.type !== 'JSXElement') {
    return '';
  }
  const attribute = child.openingElement.attributes.find(
    (attribute) => jsxAttributeName(attribute) === QwikDirective.Slot
  );
  return attribute === undefined ? '' : readStaticSlotName(attribute);
}

function readStaticSlotName(attribute: JSXAttributeItem): string {
  const name = readSlotName(attribute);
  if (typeof name === 'string') {
    return name;
  }
  throw new UnsupportedError('a dynamic slot name');
}

function readSlotName(attribute: JSXAttributeItem): string | Expression {
  if (attribute.type !== 'JSXAttribute') {
    throw new UnsupportedError('a dynamic slot name');
  }
  const value = attribute.value;
  if (value?.type === 'Literal' && typeof value.value === 'string') {
    return value.value;
  }
  if (
    value?.type === 'JSXExpressionContainer' &&
    value.expression.type === 'Literal' &&
    typeof value.expression.value === 'string'
  ) {
    return value.expression.value;
  }
  if (value?.type === 'JSXExpressionContainer' && value.expression.type !== 'JSXEmptyExpression') {
    return value.expression;
  }
  throw new UnsupportedError('a dynamic slot name');
}

function isKeyAttribute(attribute: JSXAttributeItem): boolean {
  return (
    attribute.type === 'JSXAttribute' &&
    attribute.name.type === 'JSXIdentifier' &&
    attribute.name.name === 'key'
  );
}

function propQrlBoundary(
  expression: Expression,
  name: string,
  subject: string,
  role: string
): QrlArgumentBoundary {
  return {
    nameCtx: name,
    subject,
    ctxName: name,
    boundary: { kind: BoundaryKind.Implicit, role },
    origin: {
      range: [expression.start, expression.end],
      calleeRange: null,
      argumentRanges: [],
    },
  };
}

function lowerPropFactory(expression: Expression, ctx: LowerContext, name: string) {
  const factory = ctx.jsx.factory(expression);
  return factory === null
    ? null
    : lowerFunctionQrl(
        factory.fn,
        ctx,
        propQrlBoundary(expression, name, 'a JSX prop factory', 'jsx-factory')
      );
}

/** Any `$` prop of a component is a QRL boundary under its authored key. */
function lowerQrlProp(expression: Expression, ctx: LowerContext, name: string) {
  return lowerQrlArgument(expression, ctx, propQrlBoundary(expression, name, 'a QRL prop', 'prop'));
}

function lowerComponentPropValue(expression: Expression, ctx: LowerContext, name: string) {
  const use = name.endsWith(QRL_SUFFIX)
    ? lowerQrlProp(expression, ctx, name)
    : lowerPropFactory(expression, ctx, name);
  if (use !== null) {
    return { v: ValueKind.Qrl as const, use };
  }
  return (
    tryLowerBindingPassValue(expression, ctx) ??
    lowerExpressionValue(expression, ctx, name, true, QrlPayloadKind.Function)
  );
}

/** A local passed as-is is a snapshot either way, so an identity QRL would only add a chunk. */
function tryLowerBindingPassValue(expression: Expression, ctx: LowerContext) {
  if (expression.type !== 'Identifier') {
    return null;
  }
  const binding = ctx.bindings.reference(expression);
  const kind = binding === null ? undefined : ctx.locals.get(binding)?.kind;
  switch (kind) {
    case LocalKind.Const:
    case LocalKind.Mutable:
    case LocalKind.Signal:
    case LocalKind.Store:
    case LocalKind.Qrl:
      return lowerInlineExpressionValue(
        expression,
        ctx,
        collectCaptures(expression, ctx, new Set())
      );
    default:
      return null;
  }
}

/** Prefixes a static `class` with the scope, or adds one; a dynamic class gets it from its effect. */
function scopeStaticClass(props: Prop[], scope: string): void {
  const index = props.findIndex(
    (prop) => (prop.k === PropKind.Static || prop.k === PropKind.Dynamic) && prop.name === 'class'
  );
  const klass = props[index];
  if (klass !== undefined && klass.k !== PropKind.Static) {
    return;
  }
  const authored = typeof klass?.value === 'string' && klass.value !== '' ? ` ${klass.value}` : '';
  const scoped: Prop = { k: PropKind.Static, name: 'class', value: scope + authored };
  if (klass === undefined) {
    props.unshift(scoped);
  } else {
    props[index] = scoped;
  }
}

function lowerAttribute(
  attribute: JSXAttributeItem,
  ctx: LowerContext,
  target: 'component' | 'element',
  passiveEvents: ReadonlySet<string> = new Set()
): Prop | null {
  if (attribute.type === 'JSXSpreadAttribute') {
    if (target !== 'component') {
      throw new UnsupportedError('a JSX spread attribute');
    }
    return {
      k: PropKind.Spread,
      value: lowerExpressionValue(attribute.argument, ctx, 'props', false, QrlPayloadKind.Function),
      effect: null,
    };
  }
  const authored = jsxAttributeName(attribute)!;
  if (authored === QwikDirective.Slot || authored.startsWith(PASSIVE_PREFIX)) {
    return null;
  }
  const scope = eventScopeName(authored, passiveEvents);
  if (scope !== null) {
    const lowered = lowerEventAttribute(attribute, ctx, authored, scope);
    if (lowered === null) {
      return null;
    }
    const event = lowered.event;
    return target === 'component' ? { ...event, name: authored } : event;
  }
  if (target !== 'component' && authored.endsWith(QRL_SUFFIX)) {
    throw new UnsupportedError('a non-event $ attribute on an element');
  }
  if (target === 'element' && authored === QwikDirective.InnerHtml) {
    return lowerInnerHtml(attribute, ctx);
  }
  if (target === 'element' && authored === QwikDirective.Ref) {
    return lowerRef(attribute, ctx);
  }
  const name =
    target === 'component'
      ? authored
      : (eventModifierName(authored) ?? normalizeAttributeName(authored));
  const value = attribute.value;
  if (value === null) {
    // Absent authored value = bare attribute (`<main hidden>`).
    return { k: PropKind.Static, name, value: true };
  }
  switch (value.type) {
    case 'Literal':
      return {
        k: PropKind.Static,
        name,
        value: value.value,
      };
    case 'JSXExpressionContainer': {
      if (value.expression.type === 'JSXEmptyExpression') {
        return {
          k: PropKind.Static,
          name,
          value: null,
        };
      }
      // `{false}`, `{-1}`, `{'x'}` are static: they serialize exactly as the runtime would.
      const literal = tryLowerExprIr(value.expression, ctx);
      if (literal?.kind === ValueIrKind.Lit) {
        return { k: PropKind.Static, name, value: literal.value };
      }
      return {
        k: PropKind.Dynamic,
        name,
        value:
          target === 'component'
            ? lowerComponentPropValue(value.expression, ctx, name)
            : lowerExpressionValue(value.expression, ctx, name),
        effect: null,
      };
    }
    default:
      throw new UnsupportedError('a dynamic JSX attribute value');
  }
}

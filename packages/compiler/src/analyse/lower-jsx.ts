import type { JSXAttribute, JSXAttributeItem, JSXElement } from 'oxc-parser';
import {
  ResumeKind,
  ComponentTargetKind,
  LifetimeOwner,
  OpKind,
  PropKind,
  QrlPayloadKind,
  SeedKind,
  ValueKind,
  type Op,
  type QrlUse,
  type Value,
} from '../schema';
import { NEWLINE_EATING_ELEMENTS, VOID_ELEMENTS, inferredNamespace } from '../html';
import { InvalidModuleError, UnsupportedError } from '../errors';
import { isFullyStaticSubtree } from '../static-subtree';
import { passiveEventNames } from './events';
import { checkDomNesting } from './dom-nesting';
import { isFunctionLike, jsxAttributeName, readReturnedBody, unwrapExpression } from './ast/utils';
import { lowerInlineExpressionValue } from './lower-expr';
import type { LowerContext } from './lower-context';
import { collectCaptures } from './ast/capture-analysis';
import { QwikDirective, SegmentContext } from '../words';
import { lowerContentChildren, lowerJsxChildren, lowerRenderExpression } from './lower-children';
import {
  aliasTagTarget,
  jsxMemberIr,
  jsxMemberRoot,
  lowerComponentOp,
  lowerDynamicTag,
  lowerPropsChunk,
  requireComponentBinding,
  tagNamespace,
} from './lower-component';
import {
  expandLiteralSpread,
  isKeyAttribute,
  lowerAttribute,
  lowerBinding,
  lowerFormValue,
  scopeStaticClass,
} from './lower-element';
import { lowerSlotMarker } from './lower-projection';
import { lowerRangeProgram } from './lower-render-qrl';
/**
 * Lowers a JSX render tree to structural ops. Text stays RAW in the plan — each generator folds
 * with its own escaping (SSR streams raw, CSR templates escape). Dynamic arms land per example.
 */

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
    const core = ctx.coreBindings.get(binding);
    if (core === 'Suspense') {
      return lowerSuspense(element, attributes, ctx);
    }
    return core === 'Slot'
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
    ? lowerPropsChunk(expanded, ctx, QrlPayloadKind.Value)
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
 * `<Suspense fallback$={() => <F />} delay={n}>…</Suspense>`: the marker is erased; children and
 * the fallback body each become a range program the runtime races (MULTI_HEAD_SSR.md).
 */
function lowerSuspense(
  element: JSXElement,
  attributes: readonly JSXAttributeItem[],
  ctx: LowerContext
): Op {
  let fallback: QrlUse | null = null;
  let delay: Value | null = null;
  for (const attribute of attributes) {
    const name = jsxAttributeName(attribute);
    const expression =
      attribute.type === 'JSXAttribute' &&
      attribute.value?.type === 'JSXExpressionContainer' &&
      attribute.value.expression.type !== 'JSXEmptyExpression'
        ? unwrapExpression(attribute.value.expression)
        : null;
    if (name === 'fallback$' && expression !== null && isFunctionLike(expression)) {
      const body = expression.body === null ? null : readReturnedBody(expression.body);
      if (body === null || body.statements.length > 0 || expression.params.length > 0) {
        throw new InvalidModuleError(
          'suspense-fallback',
          'A Suspense fallback$ is a parameterless function returning JSX.',
          [expression.start, expression.end]
        );
      }
      const fallbackBody = body.expression;
      fallback = lowerRangeProgram(
        [expression.start, expression.end],
        [fallbackBody],
        ctx,
        'a suspense fallback',
        SegmentContext.SuspenseFallback,
        LifetimeOwner.Suspense,
        () => lowerRenderExpression(fallbackBody, ctx)
      ).use;
      continue;
    }
    if (name === 'delay' && expression !== null) {
      // Read once at creation: a plain expression over setup values, never a tracked source.
      delay = lowerInlineExpressionValue(
        expression,
        ctx,
        collectCaptures(expression, ctx, new Set())
      );
      if (delay.v !== ValueKind.Computed || delay.resume.r !== ResumeKind.Inline) {
        throw new InvalidModuleError(
          'suspense-delay',
          'A Suspense delay is a plain expression over setup values.',
          [expression.start, expression.end]
        );
      }
      continue;
    }
    throw new InvalidModuleError(
      'suspense-attribute',
      `Suspense takes only fallback$ and delay; "${name ?? 'spread'}" is not supported.`,
      [attribute.start, attribute.end]
    );
  }
  const children = element.children;
  const { use, lifetime } = lowerRangeProgram(
    [element.start, element.end],
    [...children],
    ctx,
    'a suspense boundary',
    SegmentContext.SuspenseContent,
    LifetimeOwner.Suspense,
    () => lowerJsxChildren(children, ctx)
  );
  return {
    op: OpKind.Suspense,
    content: use,
    contentId: { kind: SeedKind.Content, ordinal: ctx.contentCounter.next++ },
    fallback,
    fallbackId: { kind: SeedKind.Content, ordinal: ctx.contentCounter.next++ },
    delay,
    blocking: false,
    lifetime,
  };
}

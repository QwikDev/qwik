/** Native elements: attributes, form values, bindings, refs, innerHTML and style scopes. */
import type { JSXAttribute, Expression, JSXAttributeItem } from 'oxc-parser';
import {
  ResumeKind,
  Shape,
  ExprKind,
  HandlerKind,
  OpKind,
  PropKind,
  QrlPayloadKind,
  ValueKind,
  type Op,
  type Prop,
} from '../schema';
import { escapeText, normalizeAttributeName } from '../html';
import { UnsupportedError } from '../errors';
import { eventModifierName, eventScopeName, PASSIVE_PREFIX } from './events';
import { lowerEventAttribute, qrlAttributeExpression } from './lower-event';
import { isFunctionLike, jsxAttributeName, unwrapExpression } from './ast/utils';
import {
  lowerExpressionValue,
  tryLowerExprIr,
  lowerInlineExpressionValue,
  trySignalReadValue,
} from './lower-expr';
import type { LowerContext } from './lower-context';
import { collectCaptures } from './ast/capture-analysis';
import { LocalKind } from './locals';
import { ValueIrKind, type ValueIR } from '../schema/value-ir';
import { QRL_SUFFIX, QwikDirective } from '../words';
import { lowerComponentPropValue } from './lower-component';
/**
 * Browsers ignore `value` markup on textarea and select. The prop stays for the client property
 * binding; the server gets the value as textarea content or as `selected` on the matching option,
 * rendered once from an inline value.
 */
export function lowerFormValue(
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
export function lowerBinding(attribute: JSXAttribute, ctx: LowerContext): Prop[] {
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
export function isHandlerList(expression: Expression): boolean {
  return (
    expression.type === 'ArrayExpression' &&
    expression.elements.some((element) => element !== null && isFunctionLike(element))
  );
}

/** `{...{ a: x, b }}` is the attributes `a={x} b={b}`; any other spread stays a spread. */
export function expandLiteralSpread(attribute: JSXAttributeItem): JSXAttributeItem[] {
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

/** Prefixes a static `class` with the scope, or adds one; a dynamic class gets it from its effect. */
export function scopeStaticClass(props: Prop[], scope: string): void {
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

export function lowerAttribute(
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
  if (
    authored === QwikDirective.Slot ||
    authored === QwikDirective.Type ||
    authored.startsWith(PASSIVE_PREFIX)
  ) {
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
export function isKeyAttribute(attribute: JSXAttributeItem): boolean {
  return (
    attribute.type === 'JSXAttribute' &&
    attribute.name.type === 'JSXIdentifier' &&
    attribute.name.name === 'key'
  );
}

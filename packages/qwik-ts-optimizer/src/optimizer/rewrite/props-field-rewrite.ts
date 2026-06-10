import { buildPropertyAccessor } from '../ast/identifier-name.js';
import {
  applyReplacements,
  collectRangeReplacements,
  expressionNeedsParens,
  isReplaceableIdentifierPosition,
  type RangeReplacementCollector,
} from '../edit/range-replace.js';
import { createTransformSession } from '../edit/transform-session.js';

interface RewritePropsFieldReferencesOptions {
  memberPropertyMode?: 'all' | 'nonComputed';
  /**
   * Optional map of localName → defaultExpressionSource. When provided,
   * rewrites for matching field names emit `(_rawProps.<key> ?? <default>)`
   * instead of bare `_rawProps.<key>`. Matches SWC's NullishCoalescing
   * emission in `transform_pat` (`swc-reference-only/props_destructuring.rs:382-388`).
   */
  defaultValues?: ReadonlyMap<string, string>;
}

/**
 * Build a {@link RangeReplacementCollector} that rewrites identifier references
 * matching `fieldMap` keys to `_rawProps.<key>` (or `(_rawProps.<key> ?? <default>)`
 * when a default is provided). Handles shorthand `Property` value positions
 * specially by emitting `key: <accessor>` to expand the shorthand.
 *
 * Predicate runs through the shared {@link isReplaceableIdentifierPosition}
 * helper.
 */
function propsFieldIdentifierCollector(
  fieldMap: ReadonlyMap<string, string>,
  defaultValues: ReadonlyMap<string, string> | undefined,
  memberPropertyMode: 'all' | 'nonComputed' | undefined,
): RangeReplacementCollector {
  return (node, ctx) => {
    if (node.type !== 'Identifier') return null;
    const localName = node.name;
    const key = fieldMap.get(localName);
    if (key === undefined) return null;

    const isShorthandValue =
      ctx.parentKey === 'value' &&
      ctx.parentNode?.type === 'Property' &&
      ctx.parentNode?.shorthand === true;

    const isReferencePosition = isShorthandValue ||
      isReplaceableIdentifierPosition(ctx.parentKey, ctx.parentNode, { memberPropertyMode });
    if (!isReferencePosition) return null;

    const baseAccessor = buildPropertyAccessor('_rawProps', key);
    const defaultExpr = defaultValues?.get(localName);
    let accessor: string;
    if (defaultExpr === undefined) {
      accessor = baseAccessor;
    } else {
      // Shorthand expands to Property-value position (precedence-safe).
      const needsParens = !isShorthandValue &&
        expressionNeedsParens(ctx.parentKey, ctx.parentNode);
      accessor = needsParens
        ? `(${baseAccessor} ?? ${defaultExpr})`
        : `${baseAccessor} ?? ${defaultExpr}`;
    }
    const replacement = isShorthandValue ? `${key}: ${accessor}` : accessor;

    return {
      replacements: [{
        start: node.start - ctx.exprStart,
        end: node.end - ctx.exprStart,
        replacement,
      }],
      // Identifier is a leaf — recursion past it is a no-op anyway, so
      // explicit skipSubtree adds nothing here.
    };
  };
}

/**
 * Replace bare references to destructured prop field names with _rawProps accessors.
 * Uses AST positions to avoid changing property keys or declaration sites.
 */
export function rewritePropsFieldReferences(
  bodyText: string,
  fieldMap: Map<string, string>,
  options: RewritePropsFieldReferencesOptions,
): string {
  if (fieldMap.size === 0) return bodyText;

  let session;
  try {
    session = createTransformSession(bodyText);
  } catch {
    return bodyText;
  }

  if (!session) return bodyText;

  const { offset, program, wrappedSource } = session;
  const collector = propsFieldIdentifierCollector(
    fieldMap,
    options.defaultValues,
    options.memberPropertyMode,
  );

  // The collector emits ranges relative to `wrappedSource`; `applyReplacements`
  // splices into `wrappedSource`, then the wrapper-prefix slice yields the
  // original body's edited form.
  const replacements = collectRangeReplacements(
    program, 0, wrappedSource, [collector],
  );
  if (replacements.length === 0) return bodyText;

  const edited = applyReplacements(wrappedSource, replacements);
  return edited.slice(offset, edited.length - session.wrapperSuffix.length);
}

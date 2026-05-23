import { buildPropertyAccessor } from './identifier-name.js';
import {
  applyReplacements,
  collectRangeReplacements,
  isReplaceableIdentifierPosition,
  type RangeReplacementCollector,
} from './range-replace.js';
import { createTransformSession } from './transform-session.js';

interface RewritePropsFieldReferencesOptions {
  parseFilename: string;
  wrapperPrefix?: string;
  wrapperSuffix?: string;
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
 * Pre-OSS-417 this was the inline `walkNode` in
 * `rewritePropsFieldReferences`; the predicate matches the historic
 * behaviour via the shared {@link isReplaceableIdentifierPosition} helper.
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
    const accessor = defaultExpr !== undefined
      ? `(${baseAccessor} ?? ${defaultExpr})`
      : baseAccessor;
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
    session = createTransformSession(options.parseFilename, bodyText, {
      wrapperPrefix: options.wrapperPrefix,
      wrapperSuffix: options.wrapperSuffix,
    });
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
  return edited.slice(offset, edited.length - (options.wrapperSuffix?.length ?? 0));
}

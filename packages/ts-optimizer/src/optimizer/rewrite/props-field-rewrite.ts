import { isReferenceIdentifier } from 'oxc-walker';
import { buildPropertyAccessor, isSimpleIdentifierName } from '../ast/identifier-name.js';
import {
  applyReplacements,
  collectRangeReplacements,
  expressionNeedsParens,
  isReplaceableIdentifierPosition,
  type RangeReplacementCollector,
} from '../edit/range-replace.js';
import { createTransformSession } from '../edit/transform-session.js';
import type { DeferredTagReads, RawPropsTransformResult } from './raw-props.js';

interface RewritePropsFieldReferencesOptions {
  memberPropertyMode?: 'all' | 'nonComputed';
  propsName?: string;
  /**
   * LocalName → default expression source. When set, matching fields emit `(_rawProps.<key> ??
   * <default>)` instead of bare `_rawProps.<key>`.
   */
  defaultValues?: ReadonlyMap<string, string>;
  /** LocalName → generated binding holding a dynamic default. */
  dynamicDefaults?: ReadonlyMap<string, string>;
}

/**
 * Collector that rewrites identifier references matching `fieldMap` keys to `_rawProps.<key>`.
 * Shorthand `Property` values expand to `key: <accessor>`.
 */
function propsFieldIdentifierCollector(
  fieldMap: ReadonlyMap<string, string>,
  defaultValues: ReadonlyMap<string, string> | undefined,
  dynamicDefaults: ReadonlyMap<string, string> | undefined,
  memberPropertyMode: 'all' | 'nonComputed' | undefined,
  propsName: string,
  deferredTagFields: Map<string, string>
): RangeReplacementCollector {
  return (node, ctx) => {
    if (node.type === 'JSXIdentifier') {
      const tagKey = fieldMap.get(node.name);
      if (tagKey === undefined || !isReferenceIdentifier(node, ctx.parentNode ?? null)) {
        return null;
      }
      const isMemberChain =
        !defaultValues?.has(node.name) &&
        !dynamicDefaults?.has(node.name) &&
        isSimpleIdentifierName(tagKey);
      if (!isMemberChain) {
        deferredTagFields.set(node.name, tagKey);
        return null;
      }
      return {
        replacements: [
          {
            start: node.start - ctx.exprStart,
            end: node.end - ctx.exprStart,
            replacement: buildPropertyAccessor(propsName, tagKey),
          },
        ],
      };
    }
    if (node.type !== 'Identifier') {
      return null;
    }
    const localName = node.name;
    const key = fieldMap.get(localName);
    if (key === undefined) {
      return null;
    }
    if (ctx.inBindingPattern) {
      return null;
    }

    const isShorthandValue =
      ctx.parentKey === 'value' &&
      ctx.parentNode?.type === 'Property' &&
      ctx.parentNode?.shorthand === true;

    const isReferencePosition =
      isShorthandValue ||
      isReplaceableIdentifierPosition(ctx.parentKey, ctx.parentNode, { memberPropertyMode });
    if (!isReferencePosition) {
      return null;
    }

    const baseAccessor = buildPropertyAccessor(propsName, key);
    const defaultExpr = defaultValues?.get(localName);
    const dynamicDefaultName = dynamicDefaults?.get(localName);
    let accessor: string;
    if (dynamicDefaultName !== undefined) {
      const conditional = `${baseAccessor} === void 0 ? ${dynamicDefaultName} : ${baseAccessor}`;
      const needsParens = !isShorthandValue && expressionNeedsParens(ctx.parentKey, ctx.parentNode);
      accessor = needsParens ? `(${conditional})` : conditional;
    } else if (defaultExpr === undefined) {
      accessor = baseAccessor;
    } else {
      // Shorthand expands to Property-value position, which is precedence-safe.
      const needsParens = !isShorthandValue && expressionNeedsParens(ctx.parentKey, ctx.parentNode);
      accessor = needsParens
        ? `(${baseAccessor} ?? ${defaultExpr})`
        : `${baseAccessor} ?? ${defaultExpr}`;
    }
    const replacement = isShorthandValue ? `${key}: ${accessor}` : accessor;

    return {
      replacements: [
        {
          start: node.start - ctx.exprStart,
          end: node.end - ctx.exprStart,
          replacement,
        },
      ],
    };
  };
}

/**
 * Replace bare references to destructured prop field names with `_rawProps` accessors, using AST
 * positions to avoid touching property keys or decl sites.
 */
export function rewritePropsFieldReferences(
  bodyText: string,
  fieldMap: Map<string, string>,
  options: RewritePropsFieldReferencesOptions
): RawPropsTransformResult {
  if (fieldMap.size === 0) {
    return { code: bodyText };
  }

  let session;
  try {
    session = createTransformSession(bodyText);
  } catch {
    return { code: bodyText };
  }

  if (!session) {
    return { code: bodyText };
  }

  const { offset, program, wrappedSource } = session;
  const propsName = options.propsName ?? '_rawProps';
  const deferredTagFields = new Map<string, string>();
  const collector = propsFieldIdentifierCollector(
    fieldMap,
    options.defaultValues,
    options.dynamicDefaults,
    options.memberPropertyMode,
    propsName,
    deferredTagFields
  );

  // Ranges are relative to `wrappedSource`; slicing off the wrapper prefix
  // yields the original body's edited form.
  const replacements = collectRangeReplacements(program, 0, wrappedSource, [collector]);
  const deferredTagReads: DeferredTagReads | undefined =
    deferredTagFields.size > 0
      ? {
          baseName: propsName,
          fieldLocalToKey: deferredTagFields,
          fieldLocalToDefault: options.defaultValues ?? new Map(),
          fieldLocalToDynamicDefault: options.dynamicDefaults ?? new Map(),
        }
      : undefined;
  if (replacements.length === 0) {
    return { code: bodyText, deferredTagReads };
  }

  const edited = applyReplacements(wrappedSource, replacements);
  return {
    code: edited.slice(offset, edited.length - session.wrapperSuffix.length),
    deferredTagReads,
  };
}

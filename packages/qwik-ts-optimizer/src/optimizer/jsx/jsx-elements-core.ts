/**
 * JSX element and fragment transformation for the Qwik optimizer.
 *
 * Transforms individual JSX element/fragment nodes into _jsxSorted,
 * _jsxSplit, or _createElement calls with correct prop classification,
 * flags, keys, and spread handling.
 */

import type { JSXAttributeItem, JSXElement, JSXFragment } from '../../ast-types.js';
import { collectPassiveDirectives } from './event-handlers.js';
import { buildCaptureProp, type LoopContext } from './loop-hoisting.js';
import {
  processProps,
  formatPropName,
  isRewrittenEventEntry,
  sortVarEntries,
  type SlotEntry,
} from './jsx-props.js';
import { processChildren } from './jsx-children.js';
import {
  type JsxTransformResult,
  processJsxTag,
  isTextOnlyElement,
  computeJsxFlags,
  type JsxKeyCounter,
  type JsxTransformContext,
  type JsxElementOptions,
  type ScopeAwareBindings,
} from './jsx.js';

function buildAdditionalSpreadsPart(
  additionalSpreads: string[],
  spreadArg: string,
): string {
  if (additionalSpreads.length === 0) {
    return '';
  }

  const spreadEntries = additionalSpreads.map((spread) => {
    if (spread === spreadArg) {
      return `..._getVarProps(${spread})`;
    }
    return `...${spread}`;
  });
  return `, ${spreadEntries.join(', ')}`;
}

function buildConstPropsPart(
  constEntries: string[],
  spreadArg: string,
  hasDuplicateSpreads: boolean,
): string {
  if (constEntries.length > 0) {
    return `{ ${constEntries.join(', ')} }`;
  }
  if (hasDuplicateSpreads) {
    return `_getConstProps(${spreadArg})`;
  }
  return 'null';
}

/**
 * Inject q:p/q:ps prop for capture context on HTML elements.
 * Mutates varEntries in place.
 */
function injectQpProp(
  node: JSXElement,
  tagIsHtml: boolean,
  inLoop: boolean,
  loopCtx: LoopContext | null | undefined,
  qpOverrides: Map<number, string[]> | undefined,
  varEntries: string[],
  constEntries: string[],
  qrlsWithCaptures: Set<string> | undefined,
): void {
  if (!tagIsHtml) return;

  const overrideParams = qpOverrides?.get(node.start);
  if (overrideParams && overrideParams.length > 0) {
    const qpResult = buildCaptureProp(overrideParams, true);
    if (qpResult) {
      varEntries.push(`${formatPropName(qpResult.propName)}: ${qpResult.propValue}`);
    }
    return;
  }

  if (!inLoop || qpOverrides) return;

  // Fall back to iterVars-based q:p for elements with event handlers in loops
  const hasEventHandlers = varEntries.some(e => isRewrittenEventEntry(e) || e.startsWith('"host:'))
    || constEntries.some(e => isRewrittenEventEntry(e) || e.startsWith('"host:'));
  if (!hasEventHandlers) return;

  // Suppress the iterVars fallback when ANY event handler on this element
  // references a QRL with hoisted cross-scope captures (qrlsWithCaptures
  // tracks both `loopLocalParamNames` and `hoistedSymbolName` cases).
  // Those handlers receive their data via `.w([captures])` bindings hoisted
  // to the outer loop scope, not via positional iterVar delivery — emitting
  // `q:p` for the immediate iterVars would be redundant and diverges from
  // SWC's emit (no q:p on these elements).
  if (qrlsWithCaptures && eventHandlerReferencesCapturingQrl(varEntries, constEntries, qrlsWithCaptures)) {
    return;
  }

  const qpResult = buildCaptureProp(loopCtx!.iterVars);
  if (qpResult) {
    varEntries.push(`${formatPropName(qpResult.propName)}: ${qpResult.propValue}`);
  }
}

/** Match `"q-e:click": <ident>` (or any rewritten-event prefix) and check the
 * identifier against the qrlsWithCaptures set. The prop name itself contains
 * a colon (`q-e:click`), so the value separator is the colon *after* the
 * closing quote of the name. */
function eventHandlerReferencesCapturingQrl(
  varEntries: string[],
  constEntries: string[],
  qrlsWithCaptures: Set<string>,
): boolean {
  for (const e of [...varEntries, ...constEntries]) {
    if (!isRewrittenEventEntry(e)) continue;
    if (e[0] !== '"') continue;
    const closingQuote = e.indexOf('"', 1);
    if (closingQuote < 0) continue;
    const colonIdx = e.indexOf(':', closingQuote);
    if (colonIdx < 0) continue;
    const valueText = e.slice(colonIdx + 1).trim();
    if (qrlsWithCaptures.has(valueText)) return true;
  }
  return false;
}

/**
 * Move event handlers from constEntries to varEntries when q:ps captures
 * include non-static-const vars. Mutates both arrays in place.
 */
function moveEventHandlersForNonConstCaptures(
  node: JSXElement,
  tagIsHtml: boolean,
  inLoop: boolean,
  qpOverrides: Map<number, string[]> | undefined,
  bindings: ScopeAwareBindings | undefined,
  importedNames: Set<string>,
  varEntries: string[],
  constEntries: string[],
  hasSpread: boolean,
): boolean {
  if (!tagIsHtml || inLoop) return false;

  const overrideParams = qpOverrides?.get(node.start);
  if (!overrideParams || overrideParams.length === 0) return false;

  const hasNonConstParam = overrideParams.some(
    p => bindings?.classify(p, node.start) !== 'const' && !importedNames.has(p),
  );
  if (!hasNonConstParam) return false;

  let movedAny = false;
  for (let i = constEntries.length - 1; i >= 0; i--) {
    if (isRewrittenEventEntry(constEntries[i])) {
      varEntries.push(constEntries[i]);
      constEntries.splice(i, 1);
      movedAny = true;
    }
  }

  if (movedAny && !hasSpread) {
    sortVarEntries(varEntries);
  }

  return movedAny;
}

/** Build a _createElement call for spread + explicit key. */
function buildCreateElementCall(
  tag: string,
  spreadArg: string,
  beforeSpreadEntries: string[],
  varEntries: string[],
  constEntries: string[],
  explicitKey: string,
  childrenText: string | null,
  neededImports: Set<string>,
): JsxTransformResult {
  neededImports.add('createElement as _createElement');

  const allPropEntries = [...beforeSpreadEntries, ...varEntries, ...constEntries];
  allPropEntries.push(`key: ${explicitKey}`);
  const propsObj = `{ ...${spreadArg}, ${allPropEntries.join(', ')} }`;
  const callString = `_createElement(${tag}, ${propsObj})`;

  return {
    tag,
    varProps: null,
    constProps: null,
    children: childrenText,
    flags: 0,
    key: explicitKey,
    callString,
    neededImports,
  };
}

/**
 * Source-ordered `_jsxSplit` emission. Returns null when the SWC-parity
 * rule doesn't apply (single spread, no spread, or no real-const-after-
 * all-spreads — the existing wrapper-based path handles those cases).
 *
 * Rule: when there are MULTIPLE spreads AND at least one explicit
 * "real-const" prop (literal/stable QRL/identifier value, not just
 * event-handler routing or `q:p*` capture metadata) positioned AFTER all
 * spreads, the explicit const props cover the const-bag completely.
 * Spreads contribute only raw `...expr` to the var-bag at their source
 * position; the var-bag preserves source order; the const-bag holds only
 * the post-all-spreads stable entries.
 *
 * Single-spread cases continue through the wrapper-based path: SWC's
 * emit there uses `_getVarProps(spread)` + `_getConstProps(spread)` so
 * the runtime can classify the spread's keys.
 */
function tryBuildSourceOrderedJsxSplit(
  tag: string,
  slotOrder: readonly SlotEntry[],
  childrenText: string | null,
  flags: number,
  keyStr: string | null,
  neededImports: Set<string>,
): JsxTransformResult | null {
  let spreadCount = 0;
  let lastSpreadStart = -1;
  for (const slot of slotOrder) {
    if (slot.kind !== 'spread') continue;
    spreadCount++;
    if (slot.sourceStart > lastSpreadStart) lastSpreadStart = slot.sourceStart;
  }
  if (spreadCount < 2) return null;

  let hasRealConstAfterSpreads = false;
  for (const slot of slotOrder) {
    if (slot.kind !== 'named') continue;
    if (slot.classification !== 'const') continue;
    if (slot.sourceStart <= lastSpreadStart) continue;
    if (isRewrittenEventEntry(slot.entry) || slot.entry.startsWith('"q:')) continue;
    hasRealConstAfterSpreads = true;
    break;
  }
  if (!hasRealConstAfterSpreads) return null;

  // Single linear pass: each slot lands in var-bag or const-bag based on
  // (kind, classification, position-relative-to-last-spread).
  const varParts: string[] = [];
  const constParts: string[] = [];
  for (const slot of slotOrder) {
    if (slot.kind === 'spread') {
      varParts.push(`...${slot.expr}`);
      continue;
    }
    const isAfterAllSpreads = slot.sourceStart > lastSpreadStart;
    if (slot.classification === 'const' && isAfterAllSpreads) {
      constParts.push(slot.entry);
    } else {
      varParts.push(slot.entry);
    }
  }

  neededImports.add('_jsxSplit');
  const varPropsPart = varParts.length > 0 ? `{ ${varParts.join(', ')} }` : 'null';
  const constPropsPart = constParts.length > 0 ? `{ ${constParts.join(', ')} }` : 'null';
  const callString =
    `_jsxSplit(${tag}, ${varPropsPart}, ${constPropsPart}, ${childrenText ?? 'null'}, ${flags}, ${keyStr ?? 'null'})`;

  return {
    tag,
    varProps: varPropsPart,
    constProps: constPropsPart,
    children: childrenText,
    flags,
    key: keyStr,
    callString,
    neededImports,
  };
}

/** Build a _jsxSplit call for spread without explicit key. */
function buildJsxSplitCall(
  tag: string,
  tagIsHtml: boolean,
  spreadArg: string,
  beforeSpreadEntries: string[],
  varEntries: string[],
  constEntries: string[],
  additionalSpreads: string[],
  childrenText: string | null,
  flags: number,
  keyStr: string | null,
  neededImports: Set<string>,
  slotOrder?: readonly SlotEntry[],
): JsxTransformResult {
  // Source-ordered emission with raw spreads when an explicit
  // "real-const" prop is positioned AFTER ALL spreads. SWC's emit rule:
  // in that case the explicit const props cover the const-bag completely
  // (cannot be overridden by spread), spreads contribute only to
  // var-bag, and the var-bag entries appear in source order with spreads
  // interleaved at their source position.
  if (slotOrder && slotOrder.length > 0) {
    const sourceOrdered = tryBuildSourceOrderedJsxSplit(
      tag, slotOrder, childrenText, flags, keyStr, neededImports,
    );
    if (sourceOrdered !== null) return sourceOrdered;
  }

  neededImports.add('_jsxSplit');
  neededImports.add('_getVarProps');
  neededImports.add('_getConstProps');

  const beforePart = beforeSpreadEntries.length > 0 ? `${beforeSpreadEntries.join(', ')}, ` : '';
  const afterPart = varEntries.length > 0 ? `, ${varEntries.join(', ')}` : '';
  const additionalSpreadsPart = buildAdditionalSpreadsPart(additionalSpreads, spreadArg);

  let varPropsPart: string;
  let constPropsPart: string;

  // Component elements with extras merge everything into varProps
  const componentHasExtras = !tagIsHtml && (
    constEntries.length > 0 || varEntries.length > 0 ||
    beforeSpreadEntries.length > 0 || additionalSpreads.length > 0
  );

  if (componentHasExtras) {
    const constPart = constEntries.length > 0 ? `, ${constEntries.join(', ')}` : '';
    varPropsPart = `{ ${beforePart}..._getVarProps(${spreadArg}), ..._getConstProps(${spreadArg})${afterPart}${constPart}${additionalSpreadsPart} }`;
    constPropsPart = 'null';
  } else {
    const hasNonBindNonEventVarEntries = varEntries.some(e =>
      !e.startsWith('"bind:') && !isRewrittenEventEntry(e) &&
      !e.startsWith('"q:p') && !e.startsWith('"q:ps'));
    const shouldMergeConst = (varEntries.length > 0 && constEntries.length > 0) || hasNonBindNonEventVarEntries;

    if (shouldMergeConst) {
      // When const entries include a "real" const prop (not just
      // event-handler routing like `"q-e:click"` or `"q:p"` capture metadata),
      // split the spreads — `_getConstProps` goes in the const bag alongside
      // the real const entries, NOT in the var bag. Mirrors SWC's emit for
      // `<div ... {...rest} override>` where `override` is a real const prop:
      //   var: { ..._getVarProps(rest), <var entries> }
      //   const: { ..._getConstProps(rest), override: true }
      // For event-handler-only const entries (e.g. `should_move_bind_value_to_var_props`),
      // the current merged form stays — both spreads in var bag, const bag
      // carries just the event handler.
      const hasRealConstEntries = constEntries.some(
        (e) => !isRewrittenEventEntry(e) && !e.startsWith('"q:'),
      );
      if (hasRealConstEntries) {
        varPropsPart = `{ ${beforePart}..._getVarProps(${spreadArg})${afterPart}${additionalSpreadsPart} }`;
        constPropsPart = `{ ..._getConstProps(${spreadArg}), ${constEntries.join(', ')} }`;
      } else {
        varPropsPart = `{ ${beforePart}..._getVarProps(${spreadArg}), ..._getConstProps(${spreadArg})${afterPart}${additionalSpreadsPart} }`;
        const hasDuplicateSpreads = additionalSpreads.some(s => s === spreadArg);
        constPropsPart = buildConstPropsPart(
          constEntries,
          spreadArg,
          hasDuplicateSpreads,
        );
      }
    } else {
      varPropsPart = `{ ${beforePart}..._getVarProps(${spreadArg})${afterPart}${additionalSpreadsPart} }`;
      constPropsPart = constEntries.length > 0
        ? `{ ..._getConstProps(${spreadArg}), ${constEntries.join(', ')} }`
        : `_getConstProps(${spreadArg})`;
    }
  }

  const callString = `_jsxSplit(${tag}, ${varPropsPart}, ${constPropsPart}, ${childrenText ?? 'null'}, ${flags}, ${keyStr ?? 'null'})`;

  return {
    tag,
    varProps: varPropsPart,
    constProps: constPropsPart,
    children: childrenText,
    flags,
    key: keyStr,
    callString,
    neededImports,
  };
}

/**
 * Transform a single JSX element node to a _jsxSorted/_jsxSplit/_createElement call.
 */
export function transformJsxElement(
  ctx: JsxTransformContext,
  node: JSXElement,
  opts: JsxElementOptions = {},
): JsxTransformResult | null {
  if (node.type !== 'JSXElement') return null;

  const { source, s, importedNames, keyCounter, signalHoister, bindings, allDeclaredNames, qrlsWithCaptures } = ctx;
  const { passiveEvents, loopCtx, isSoleChild, enableChildSignals = true, qpOverrides } = opts;

  const neededImports = new Set<string>();
  const openingElement = node.openingElement;
  const tag = processJsxTag(openingElement.name);
  const tagIsHtml = tag.startsWith('"') && tag.length > 2 &&
    tag[1] === tag[1].toLowerCase() && tag[1] >= 'a' && tag[1] <= 'z';
  const rawTagName = tagIsHtml ? tag.slice(1, -1) : '';
  const textOnly = tagIsHtml && isTextOnlyElement(rawTagName);
  const elementPassiveEvents = passiveEvents ?? collectPassiveDirectives(openingElement.attributes);
  const inLoop = !!loopCtx && loopCtx.iterVars.length > 0;

  const preHasSpread = openingElement.attributes?.some(
    (a: JSXAttributeItem) => a.type === 'JSXSpreadAttribute',
  ) ?? false;
  const preHasKey = openingElement.attributes?.some(
    (a: JSXAttributeItem) => a.type === 'JSXAttribute' &&
      ((a.name?.type === 'JSXIdentifier' && a.name.name === 'key') ||
       (a.name?.type === 'JSXNamespacedName' && a.name.name?.name === 'key')),
  ) ?? false;
  const willUseCreateElement = preHasSpread && preHasKey;

  const {
    varEntries,
    constEntries,
    beforeSpreadEntries,
    additionalSpreads,
    key: explicitKey,
    hasVarProps,
    hasVarEventHandler: initialHasVarEventHandler,
    hasSpread,
    slotOrder,
    neededImports: propImports,
  } = processProps(ctx, openingElement.attributes, {
    tagIsHtml,
    passiveEvents: elementPassiveEvents,
    inLoop,
    skipSignalAnalysis: willUseCreateElement,
  });
  let hasVarEventHandler = initialHasVarEventHandler;

  for (const imp of propImports) {
    neededImports.add(imp);
  }

  injectQpProp(node, tagIsHtml, inLoop, loopCtx, qpOverrides, varEntries, constEntries, qrlsWithCaptures);

  if (moveEventHandlersForNonConstCaptures(
    node, tagIsHtml, inLoop, qpOverrides, bindings, importedNames,
    varEntries, constEntries, hasSpread,
  )) {
    hasVarEventHandler = true;
  }

  const childSignalsEnabled = enableChildSignals && !textOnly;
  const { text: childrenText, type: childrenType } = processChildren(ctx, node.children, {
    neededImports,
    enableSignalAnalysis: childSignalsEnabled,
  });

  const hasQpProp = varEntries.some(e => e.startsWith('"q:p"') || e.startsWith('"q:ps"'))
    || constEntries.some(e => e.startsWith('"q:p"') || e.startsWith('"q:ps"'));
  const effectiveLoopCtx = tagIsHtml && (qpOverrides ? hasQpProp : (!!loopCtx && hasQpProp));
  const effectiveHasVarProps = varEntries.length > 0 || beforeSpreadEntries.length > 0;
  const isRealLoop = !!loopCtx && loopCtx.iterVars.length > 0;
  const isCaptureOnly = effectiveLoopCtx && !isRealLoop;

  let flags: number;
  if (hasSpread) {
    const hasQpEntry = varEntries.some(e => e.startsWith('"q:p"') || e.startsWith('"q:p":') || e.startsWith('"q:ps"') || e.startsWith('"q:ps":'));
    flags = hasQpEntry ? 4 : 0;
  } else if (isCaptureOnly) {
    flags = computeJsxFlags(hasVarProps, childrenType, false, hasVarEventHandler) | 4;
  } else {
    flags = computeJsxFlags(effectiveHasVarProps, childrenType, effectiveLoopCtx, hasVarEventHandler);
  }

  let keyStr: string | null;
  if (explicitKey !== null) {
    keyStr = explicitKey;
  } else if (isSoleChild && tagIsHtml) {
    keyStr = null;
  } else {
    keyStr = `"${keyCounter.next()}"`;
  }

  if (hasSpread) {
    const spreadAttr = openingElement.attributes.find(
      (a: JSXAttributeItem) => a.type === 'JSXSpreadAttribute',
    );
    const spreadArg = spreadAttr
      ? source.slice(spreadAttr.argument.start, spreadAttr.argument.end)
      : 'props';

    if (explicitKey !== null) {
      return buildCreateElementCall(
        tag, spreadArg, beforeSpreadEntries, varEntries, constEntries,
        explicitKey, childrenText, neededImports,
      );
    }

    return buildJsxSplitCall(
      tag, tagIsHtml, spreadArg, beforeSpreadEntries, varEntries, constEntries,
      additionalSpreads, childrenText, flags, keyStr, neededImports, slotOrder,
    );
  }

  const hasBindInConst = !tagIsHtml && constEntries.some(e => e.startsWith('"bind:'));
  const varProps = varEntries.length > 0 ? `{ ${varEntries.join(', ')} }` : null;
  const constProps = constEntries.length > 0 ? `{ ${constEntries.join(', ')} }` : null;
  const jsxFn = hasBindInConst ? '_jsxSplit' : '_jsxSorted';
  neededImports.add(jsxFn);
  const callString = `${jsxFn}(${tag}, ${varProps ?? 'null'}, ${constProps ?? 'null'}, ${childrenText ?? 'null'}, ${flags}, ${keyStr ?? 'null'})`;

  return {
    tag,
    varProps,
    constProps,
    children: childrenText,
    flags,
    key: keyStr,
    callString,
    neededImports,
  };
}

/**
 * Transform a JSX fragment node to a _jsxSorted call.
 */
export function transformJsxFragment(
  ctx: JsxTransformContext,
  node: JSXFragment,
): JsxTransformResult | null {
  if (node.type !== 'JSXFragment') return null;

  const { keyCounter } = ctx;
  const neededImports = new Set<string>();
  neededImports.add('_jsxSorted');

  const { text: childrenText, type: childrenType } = processChildren(ctx, node.children, {
    neededImports,
  });

  const flags = computeJsxFlags(false, childrenType);
  const keyStr = `"${keyCounter.next()}"`;
  const callString = `_jsxSorted(_Fragment, null, null, ${childrenText ?? 'null'}, ${flags}, ${keyStr})`;

  return {
    tag: '_Fragment',
    varProps: null,
    constProps: null,
    children: childrenText,
    flags,
    key: keyStr,
    callString,
    neededImports,
  };
}

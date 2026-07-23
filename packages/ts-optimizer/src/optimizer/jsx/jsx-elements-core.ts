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

function buildAdditionalSpreadsPart(additionalSpreads: string[], spreadArg: string): string {
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
  hasDuplicateSpreads: boolean
): string {
  if (constEntries.length > 0) {
    return `{ ${constEntries.join(', ')} }`;
  }
  if (hasDuplicateSpreads) {
    return `_getConstProps(${spreadArg})`;
  }
  return 'null';
}

function injectQpProp(
  node: JSXElement,
  tagIsHtml: boolean,
  inLoop: boolean,
  loopCtx: LoopContext | null | undefined,
  qpOverrides: Map<number, string[]> | undefined,
  varEntries: string[],
  constEntries: string[],
  qrlsWithCaptures: Set<string> | undefined
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

  const hasEventHandlers =
    varEntries.some((e) => isRewrittenEventEntry(e) || e.startsWith('"host:')) ||
    constEntries.some((e) => isRewrittenEventEntry(e) || e.startsWith('"host:'));
  if (!hasEventHandlers) return;

  // Suppress the iterVars fallback when an event handler references a QRL with
  // hoisted cross-scope captures: those handlers receive data via `.w([captures])`
  // bindings hoisted to the outer loop scope, so an immediate-iterVars `q:p`
  // would be redundant.
  if (
    qrlsWithCaptures &&
    eventHandlerReferencesCapturingQrl(varEntries, constEntries, qrlsWithCaptures)
  ) {
    return;
  }

  const qpResult = buildCaptureProp(loopCtx!.iterVars);
  if (qpResult) {
    varEntries.push(`${formatPropName(qpResult.propName)}: ${qpResult.propValue}`);
  }
}

/**
 * The prop name itself contains a colon (`q-e:click`), so the value separator is the colon _after_
 * the name's closing quote.
 */
function eventHandlerReferencesCapturingQrl(
  varEntries: string[],
  constEntries: string[],
  qrlsWithCaptures: Set<string>
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

function moveEventHandlersForNonConstCaptures(
  node: JSXElement,
  tagIsHtml: boolean,
  inLoop: boolean,
  qpOverrides: Map<number, string[]> | undefined,
  bindings: ScopeAwareBindings | undefined,
  importedNames: Set<string>,
  varEntries: string[],
  constEntries: string[],
  hasSpread: boolean
): boolean {
  if (!tagIsHtml || inLoop) return false;

  const overrideParams = qpOverrides?.get(node.start);
  if (!overrideParams || overrideParams.length === 0) return false;

  const hasNonConstParam = overrideParams.some(
    (p) => bindings?.classify(p, node.start) !== 'const' && !importedNames.has(p)
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

function buildCreateElementCall(
  tag: string,
  spreadArg: string,
  beforeSpreadEntries: string[],
  varEntries: string[],
  constEntries: string[],
  explicitKey: string,
  childrenText: string | null,
  neededImports: Set<string>
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
 * Source-ordered `_jsxSplit` emission. Returns null when the rule doesn't apply (single spread, no
 * spread, or no real-const-after-all-spreads — the wrapper-based path handles those).
 *
 * Rule: with MULTIPLE spreads AND at least one explicit "real-const" prop
 * (literal/stable-QRL/identifier value, not event-handler routing or `q:p*` metadata) positioned
 * AFTER all spreads, the explicit const props cover the const-bag completely; spreads contribute
 * only raw `...expr` to the var-bag at their source position, and the var-bag preserves source
 * order. Single-spread cases go through the wrapper-based path so the spread's keys are classified
 * at runtime.
 */
function tryBuildSourceOrderedJsxSplit(
  tag: string,
  slotOrder: readonly SlotEntry[],
  childrenText: string | null,
  flags: number,
  keyStr: string | null,
  neededImports: Set<string>
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
  slotOrder?: readonly SlotEntry[]
): JsxTransformResult {
  if (slotOrder && slotOrder.length > 0) {
    const sourceOrdered = tryBuildSourceOrderedJsxSplit(
      tag,
      slotOrder,
      childrenText,
      flags,
      keyStr,
      neededImports
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

  const componentHasExtras =
    !tagIsHtml &&
    (constEntries.length > 0 ||
      varEntries.length > 0 ||
      beforeSpreadEntries.length > 0 ||
      additionalSpreads.length > 0);

  const partitionableComponentSpread =
    componentHasExtras && additionalSpreads.length === 0 && constEntries.length > 0;

  if (partitionableComponentSpread) {
    const hasVarAfterSpread = varEntries.length > 0;
    const getConstInVar = hasVarAfterSpread ? `, ..._getConstProps(${spreadArg})` : '';
    varPropsPart = `{ ${beforePart}..._getVarProps(${spreadArg})${getConstInVar}${afterPart} }`;
    const getConstInConst = hasVarAfterSpread ? '' : `..._getConstProps(${spreadArg}), `;
    constPropsPart = `{ ${getConstInConst}${constEntries.join(', ')} }`;
  } else if (componentHasExtras) {
    const constPart = constEntries.length > 0 ? `, ${constEntries.join(', ')}` : '';
    varPropsPart = `{ ${beforePart}..._getVarProps(${spreadArg}), ..._getConstProps(${spreadArg})${afterPart}${constPart}${additionalSpreadsPart} }`;
    constPropsPart = 'null';
  } else {
    const hasNonBindNonEventVarEntries = varEntries.some(
      (e) =>
        !e.startsWith('"bind:') &&
        !isRewrittenEventEntry(e) &&
        !e.startsWith('"q:p') &&
        !e.startsWith('"q:ps')
    );
    const shouldMergeConst =
      (varEntries.length > 0 && constEntries.length > 0) || hasNonBindNonEventVarEntries;

    if (shouldMergeConst) {
      // When const entries include a "real" const prop (not just event-handler
      // routing or `q:p` metadata), split the spreads: `_getConstProps` goes in
      // the const bag alongside the real const entries. Event-handler-only const
      // entries keep the merged form (both spreads in the var bag).
      const hasRealConstEntries = constEntries.some(
        (e) => !isRewrittenEventEntry(e) && !e.startsWith('"q:')
      );
      if (hasRealConstEntries) {
        varPropsPart = `{ ${beforePart}..._getVarProps(${spreadArg})${afterPart}${additionalSpreadsPart} }`;
        constPropsPart = `{ ..._getConstProps(${spreadArg}), ${constEntries.join(', ')} }`;
      } else {
        varPropsPart = `{ ${beforePart}..._getVarProps(${spreadArg}), ..._getConstProps(${spreadArg})${afterPart}${additionalSpreadsPart} }`;
        const hasDuplicateSpreads = additionalSpreads.some((s) => s === spreadArg);
        constPropsPart = buildConstPropsPart(constEntries, spreadArg, hasDuplicateSpreads);
      }
    } else {
      varPropsPart = `{ ${beforePart}..._getVarProps(${spreadArg})${afterPart}${additionalSpreadsPart} }`;
      constPropsPart =
        constEntries.length > 0
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

export function transformJsxElement(
  ctx: JsxTransformContext,
  node: JSXElement,
  opts: JsxElementOptions = {}
): JsxTransformResult | null {
  if (node.type !== 'JSXElement') return null;

  const {
    source,
    s,
    importedNames,
    keyCounter,
    signalHoister,
    bindings,
    allDeclaredNames,
    qrlsWithCaptures,
  } = ctx;
  const { passiveEvents, loopCtx, isSoleChild, enableChildSignals = true, qpOverrides } = opts;

  const neededImports = new Set<string>();
  const openingElement = node.openingElement;
  const tag = processJsxTag(openingElement.name);
  const tagIsHtml = tag.startsWith('"') && tag.length > 2;
  const rawTagName = tagIsHtml ? tag.slice(1, -1) : '';
  const textOnly = tagIsHtml && isTextOnlyElement(rawTagName);
  const elementPassiveEvents = passiveEvents ?? collectPassiveDirectives(openingElement.attributes);
  const inLoop = !!loopCtx && loopCtx.iterVars.length > 0;

  const preHasSpread =
    openingElement.attributes?.some((a: JSXAttributeItem) => a.type === 'JSXSpreadAttribute') ??
    false;
  const preHasKey =
    openingElement.attributes?.some(
      (a: JSXAttributeItem) =>
        a.type === 'JSXAttribute' &&
        ((a.name?.type === 'JSXIdentifier' && a.name.name === 'key') ||
          (a.name?.type === 'JSXNamespacedName' && a.name.name?.name === 'key'))
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

  injectQpProp(
    node,
    tagIsHtml,
    inLoop,
    loopCtx,
    qpOverrides,
    varEntries,
    constEntries,
    qrlsWithCaptures
  );

  if (
    moveEventHandlersForNonConstCaptures(
      node,
      tagIsHtml,
      inLoop,
      qpOverrides,
      bindings,
      importedNames,
      varEntries,
      constEntries,
      hasSpread
    )
  ) {
    hasVarEventHandler = true;
  }

  const childSignalsEnabled = enableChildSignals && !textOnly;
  const { text: childrenText, type: childrenType } = processChildren(ctx, node.children, {
    neededImports,
    enableSignalAnalysis: childSignalsEnabled,
  });

  const hasQpProp =
    varEntries.some((e) => e.startsWith('"q:p"') || e.startsWith('"q:ps"')) ||
    constEntries.some((e) => e.startsWith('"q:p"') || e.startsWith('"q:ps"'));
  const effectiveLoopCtx = tagIsHtml && (qpOverrides ? hasQpProp : !!loopCtx && hasQpProp);
  const effectiveHasVarProps = varEntries.length > 0 || beforeSpreadEntries.length > 0;
  const isRealLoop = !!loopCtx && loopCtx.iterVars.length > 0;
  const isCaptureOnly = effectiveLoopCtx && !isRealLoop;

  let flags: number;
  if (hasSpread) {
    const hasQpEntry = varEntries.some(
      (e) =>
        e.startsWith('"q:p"') ||
        e.startsWith('"q:p":') ||
        e.startsWith('"q:ps"') ||
        e.startsWith('"q:ps":')
    );
    flags = hasQpEntry ? 4 : 0;
  } else if (isCaptureOnly) {
    flags = computeJsxFlags(hasVarProps, childrenType, false, hasVarEventHandler) | 4;
  } else {
    flags = computeJsxFlags(
      effectiveHasVarProps,
      childrenType,
      effectiveLoopCtx,
      hasVarEventHandler
    );
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
      (a: JSXAttributeItem) => a.type === 'JSXSpreadAttribute'
    );
    const spreadArg = spreadAttr
      ? source.slice(spreadAttr.argument.start, spreadAttr.argument.end)
      : 'props';

    if (explicitKey !== null) {
      return buildCreateElementCall(
        tag,
        spreadArg,
        beforeSpreadEntries,
        varEntries,
        constEntries,
        explicitKey,
        childrenText,
        neededImports
      );
    }

    return buildJsxSplitCall(
      tag,
      tagIsHtml,
      spreadArg,
      beforeSpreadEntries,
      varEntries,
      constEntries,
      additionalSpreads,
      childrenText,
      flags,
      keyStr,
      neededImports,
      slotOrder
    );
  }

  const hasBindInConst = !tagIsHtml && constEntries.some((e) => e.startsWith('"bind:'));
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

export function transformJsxFragment(
  ctx: JsxTransformContext,
  node: JSXFragment
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

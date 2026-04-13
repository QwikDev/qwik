/**
 * JSX element and fragment transformation for the Qwik optimizer.
 *
 * Transforms individual JSX element/fragment nodes into _jsxSorted,
 * _jsxSplit, or _createElement calls with correct prop classification,
 * flags, keys, and spread handling.
 */

import type MagicString from 'magic-string';
import type { JSXAttributeItem } from '../../ast-types.js';
import { SignalHoister } from '../signal-analysis.js';
import { collectPassiveDirectives } from './event-handlers.js';
import { buildQpProp, type LoopContext } from '../loop-hoisting.js';
import {
  processProps,
  formatPropName,
  isRewrittenEventEntry,
  sortVarEntries,
} from './jsx-props.js';
import { processChildren } from './jsx-children.js';
import {
  type JsxTransformResult,
  processJsxTag,
  isTextOnlyElement,
  computeFlags,
  type JsxKeyCounter,
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
  node: any,
  tagIsHtml: boolean,
  inLoop: boolean,
  loopCtx: LoopContext | null | undefined,
  qpOverrides: Map<number, string[]> | undefined,
  varEntries: string[],
  constEntries: string[],
): void {
  if (!tagIsHtml) return;

  const overrideParams = qpOverrides?.get(node.start);
  if (overrideParams && overrideParams.length > 0) {
    const qpResult = buildQpProp(overrideParams, true);
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

  const qpResult = buildQpProp(loopCtx!.iterVars);
  if (qpResult) {
    varEntries.push(`${formatPropName(qpResult.propName)}: ${qpResult.propValue}`);
  }
}

/**
 * Move event handlers from constEntries to varEntries when q:ps captures
 * include non-static-const vars. Mutates both arrays in place.
 */
function moveEventHandlersForNonConstCaptures(
  node: any,
  tagIsHtml: boolean,
  inLoop: boolean,
  qpOverrides: Map<number, string[]> | undefined,
  constIdents: Set<string> | undefined,
  importedNames: Set<string>,
  varEntries: string[],
  constEntries: string[],
  hasSpread: boolean,
): boolean {
  if (!tagIsHtml || inLoop) return false;

  const overrideParams = qpOverrides?.get(node.start);
  if (!overrideParams || overrideParams.length === 0) return false;

  const hasNonConstParam = overrideParams.some(p => !constIdents?.has(p) && !importedNames.has(p));
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
): JsxTransformResult {
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
      varPropsPart = `{ ${beforePart}..._getVarProps(${spreadArg}), ..._getConstProps(${spreadArg})${afterPart}${additionalSpreadsPart} }`;
      const hasDuplicateSpreads = additionalSpreads.some(s => s === spreadArg);
      constPropsPart = buildConstPropsPart(
        constEntries,
        spreadArg,
        hasDuplicateSpreads,
      );
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
  node: any,
  source: string,
  s: MagicString,
  importedNames: Set<string>,
  keyCounter: JsxKeyCounter,
  passiveEvents?: Set<string>,
  signalHoister?: SignalHoister,
  loopCtx?: LoopContext | null,
  isSoleChild?: boolean,
  enableChildSignals: boolean = true,
  qpOverrides?: Map<number, string[]>,
  qrlsWithCaptures?: Set<string>,
  paramNames?: Set<string>,
  constIdents?: Set<string>,
  allDeclaredNames?: Set<string>,
): JsxTransformResult | null {
  if (node.type !== 'JSXElement') return null;

  const neededImports = new Set<string>();
  const openingElement = node.openingElement;
  const tag = processJsxTag(openingElement.name);
  const tagIsHtml = tag.startsWith('"') && tag.length > 2 &&
    tag[1] === tag[1].toLowerCase() && tag[1] >= 'a' && tag[1] <= 'z';
  const rawTagName = tagIsHtml ? tag.slice(1, -1) : '';
  const textOnly = tagIsHtml && isTextOnlyElement(rawTagName);
  const elementPassiveEvents = passiveEvents ?? collectPassiveDirectives(openingElement.attributes);
  const hoister = signalHoister ?? new SignalHoister();
  const inLoop = !!loopCtx && loopCtx.iterVars.length > 0;

  // Pre-detect _createElement path (spread + explicit key skips signal analysis)
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
    neededImports: propImports,
  } = processProps(openingElement.attributes, source, importedNames, tagIsHtml, elementPassiveEvents, hoister, inLoop, qrlsWithCaptures, paramNames, constIdents, allDeclaredNames, willUseCreateElement);
  let hasVarEventHandler = initialHasVarEventHandler;

  for (const imp of propImports) {
    neededImports.add(imp);
  }

  // Inject q:p/q:ps for capture context
  injectQpProp(node, tagIsHtml, inLoop, loopCtx, qpOverrides, varEntries, constEntries);

  // Move event handlers to varProps when captures include non-const vars
  if (moveEventHandlersForNonConstCaptures(
    node, tagIsHtml, inLoop, qpOverrides, constIdents, importedNames,
    varEntries, constEntries, hasSpread,
  )) {
    hasVarEventHandler = true;
  }

  // Children: text-only elements and disabled signals skip _wrapProp/_fnSignal
  const childSignalsEnabled = enableChildSignals && !textOnly;
  const { text: childrenText, type: childrenType } = processChildren(
    node.children,
    source,
    s,
    childSignalsEnabled ? importedNames : undefined,
    childSignalsEnabled ? hoister : undefined,
    neededImports,
    constIdents,
    allDeclaredNames,
  );

  // Compute flags
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
    flags = computeFlags(hasVarProps, childrenType, false, hasVarEventHandler) | 4;
  } else {
    flags = computeFlags(effectiveHasVarProps, childrenType, effectiveLoopCtx, hasVarEventHandler);
  }

  // Key: explicit > null for child HTML elements > generated
  let keyStr: string | null;
  if (explicitKey !== null) {
    keyStr = explicitKey;
  } else if (isSoleChild && tagIsHtml) {
    keyStr = null;
  } else {
    keyStr = `"${keyCounter.next()}"`;
  }

  // Build the final call
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
      additionalSpreads, childrenText, flags, keyStr, neededImports,
    );
  }

  // Dynamic component tags with bind: props use _jsxSplit
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
  node: any,
  source: string,
  s: MagicString,
  importedNames: Set<string>,
  keyCounter: JsxKeyCounter,
  _isSoleChild?: boolean,
  constIdents?: Set<string>,
  signalHoister?: SignalHoister,
  allDeclaredNames?: Set<string>,
): JsxTransformResult | null {
  if (node.type !== 'JSXFragment') return null;

  const neededImports = new Set<string>();
  neededImports.add('_jsxSorted');

  const { text: childrenText, type: childrenType } = processChildren(
    node.children,
    source,
    s,
    importedNames,
    signalHoister,
    neededImports,
    constIdents,
    allDeclaredNames,
  );

  const flags = computeFlags(false, childrenType);
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

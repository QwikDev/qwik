/**
 * JSX attribute/prop processing for the Qwik optimizer.
 *
 * Classifies JSX attributes into varProps and constProps, handles event
 * handler transformation, bind desugaring, spread attributes, and
 * signal analysis for prop values.
 */

import type { AstMaybeNode, JSXAttributeItem } from '../../ast-types.js';
import { analyzeSignalExpression } from '../signal-analysis.js';
import { transformEventPropName, isEventProp, isPassiveDirective } from './event-handlers.js';
import { isBindProp, transformBindProp, mergeEventHandlers } from './bind.js';
import {
  classifyConstness,
  isConstBindingName,
  type JsxTransformContext,
  type ProcessPropsOptions,
} from './jsx.js';
import { simplifyExpression, formatSimplifiedLiteral } from '../utils/simplify.js';

/**
 * Slot entry — one element per JSX attribute in source order. Captures
 * enough information for `buildJsxSplitCall` (OSS-434) to assemble var/
 * const bags while preserving SWC's emit ordering rules:
 *
 *   - top-level: attributes appear in source order;
 *   - named props with stable values placed AFTER ALL spreads land in
 *     the const-bag; everything else (including stable-but-pre-spread
 *     and unstable values) lands in the var-bag at its source position;
 *   - spreads appear as raw `...expr` in the var-bag at source position
 *     when the post-all-spreads const set is non-empty; otherwise the
 *     `_getVarProps`/`_getConstProps` split wrappers are needed for the
 *     spread's content to be classified at runtime.
 */
export type SlotEntry =
  | {
      readonly kind: 'named';
      readonly entry: string;
      readonly classification: 'var' | 'const';
      readonly sourceStart: number;
    }
  | {
      readonly kind: 'spread';
      readonly expr: string;
      readonly sourceStart: number;
    };

/** True for value nodes that are always const (literals, arrows, identifiers). */
function isConstValueNode(valueNode: AstMaybeNode): boolean {
  if (!valueNode) return true;
  switch (valueNode.type) {
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'Identifier':
    case 'Literal':
      return true;
    default:
      return false;
  }
}

/** True for pre-rewritten event handler prop prefixes (q-e:, q-d:, q-w:, etc.). */
function isRewrittenEventProp(propName: string): boolean {
  return propName.startsWith('q-e:') || propName.startsWith('q-d:') ||
    propName.startsWith('q-w:') || propName.startsWith('q-ep:') ||
    propName.startsWith('q-dp:') || propName.startsWith('q-wp:');
}

/** True if entry string starts with a rewritten event handler prefix. */
export function isRewrittenEventEntry(entry: string): boolean {
  return entry.startsWith('"q-e:') || entry.startsWith('"q-d:') ||
    entry.startsWith('"q-w:') || entry.startsWith('"q-ep:') ||
    entry.startsWith('"q-dp:') || entry.startsWith('"q-wp:');
}

/** Sort var entries alphabetically by prop key (SWC sorts var_props when no spread). */
export function sortVarEntries(entries: string[]): void {
  if (entries.length > 1) {
    entries.sort((a, b) => {
      const keyA = a.split(':')[0].replace(/"/g, '').trim();
      const keyB = b.split(':')[0].replace(/"/g, '').trim();
      return keyA.localeCompare(keyB);
    });
  }
}

function needsQuoting(name: string): boolean {
  return /[^a-zA-Z0-9_$]/.test(name);
}

export function formatPropName(name: string): string {
  return needsQuoting(name) ? `"${name}"` : name;
}

/**
 * Process JSX attributes and classify them into varProps and constProps.
 */
export function processProps(
  ctx: JsxTransformContext,
  attributes: JSXAttributeItem[],
  opts: ProcessPropsOptions,
): {
  varEntries: string[];
  constEntries: string[];
  beforeSpreadEntries: string[];
  key: string | null;
  hasVarProps: boolean;
  hasVarEventHandler: boolean;
  hasSpread: boolean;
  additionalSpreads: string[];
  slotOrder: SlotEntry[];
  neededImports: Set<string>;
} {
  const { source, importedNames, signalHoister, qrlsWithCaptures, paramNames, bindings, allDeclaredNames } = ctx;
  const { tagIsHtml, passiveEvents, inLoop, skipSignalAnalysis } = opts;
  const varEntries: string[] = [];
  const constEntries: string[] = [];
  const beforeSpreadEntries: string[] = [];
  const slotOrder: SlotEntry[] = [];
  const neededImports = new Set<string>();
  let key: string | null = null;
  let hasSpread = false;
  let hasVarEventHandler = false;
  const bindHandlers = new Map<string, string>();

  if (!attributes || attributes.length === 0) {
    return { varEntries, constEntries, beforeSpreadEntries, key, hasVarProps: false, hasVarEventHandler: false, hasSpread, additionalSpreads: [], slotOrder, neededImports };
  }

  // OSS-434 helpers: keep the legacy buckets in sync with `slotOrder` at
  // every push site. The dual write costs little and avoids ripple to the
  // many existing readers of the buckets (event-handler movement,
  // `buildJsxSplitCall` legacy paths, `_jsxSorted` no-spread emit, etc.).
  const pushNamed = (
    bucket: string[],
    entry: string,
    classification: 'var' | 'const',
    sourceStart: number,
  ): void => {
    bucket.push(entry);
    slotOrder.push({ kind: 'named', entry, classification, sourceStart });
  };
  const pushSpread = (expr: string, sourceStart: number): void => {
    slotOrder.push({ kind: 'spread', expr, sourceStart });
  };

  const hasSpreadAttr = attributes.some(a => a.type === 'JSXSpreadAttribute');
  const spreadIndex = attributes.findIndex(a => a.type === 'JSXSpreadAttribute');
  const additionalSpreads: string[] = [];
  let spreadCount = 0;

  for (let attrIdx = 0; attrIdx < attributes.length; attrIdx++) {
    const attr = attributes[attrIdx];
    const beforeSpread = hasSpreadAttr && attrIdx < spreadIndex;

    if (attr.type === 'JSXSpreadAttribute') {
      hasSpread = true;
      spreadCount++;
      const spreadExpr = source.slice(attr.argument.start, attr.argument.end);
      if (spreadCount > 1) {
        additionalSpreads.push(spreadExpr);
      }
      pushSpread(spreadExpr, attr.start);
      continue;
    }

    if (attr.type !== 'JSXAttribute') continue;

    let propName: string | undefined;
    if (attr.name?.type === 'JSXNamespacedName') {
      propName = `${attr.name.namespace.name}:${attr.name.name.name}`;
    } else {
      propName = attr.name?.name;
    }
    if (!propName) continue;

    if (propName === 'className' && tagIsHtml) {
      propName = 'class';
    }

    if (propName === 'key') {
      if (attr.value) {
        if (attr.value.type === 'JSXExpressionContainer') {
          key = source.slice(attr.value.expression.start, attr.value.expression.end);
        } else if (attr.value.type === 'Literal') {
          key = `"${attr.value.value}"`;
        }
      }
      continue;
    }

    if (isPassiveDirective(propName)) continue;

    if (propName.startsWith('preventdefault:')) {
      const eventName = propName.slice('preventdefault:'.length);
      if (!passiveEvents.has(eventName)) {
        pushNamed(constEntries, `"${propName}": true`, 'const', attr.start);
      }
      continue;
    }

    let valueText: string;
    let valueNode: AstMaybeNode;

    if (attr.value === null || attr.value === undefined) {
      valueText = 'true';
      valueNode = null;
    } else if (attr.value.type === 'JSXExpressionContainer') {
      valueNode = attr.value.expression;
      valueText = source.slice(valueNode.start, valueNode.end);
      // Match SWC's `simplify::simplifier` (explicitly invoked from
      // swc-reference-only/parse.rs:360) by simplifying compile-time-
      // constant prop expressions to their literal result. Without
      // this, `prop={'true' + 1 ? 'true' : ''}` emits as
      // `prop: "true" + 1 ? "true" : ""` instead of `prop: 'true'`.
      const simplified = simplifyExpression(valueNode);
      if (simplified.simplified) {
        valueText = formatSimplifiedLiteral(simplified.value);
      }
    } else {
      valueNode = attr.value;
      valueText = source.slice(attr.value.start, attr.value.end);
    }

    if (isBindProp(propName) && !tagIsHtml) {
      pushNamed(constEntries, `"${propName}": ${valueText}`, 'const', attr.start);
      continue;
    }

    if (isBindProp(propName) && !hasSpreadAttr) {
      const bindResult = transformBindProp(propName, valueText);
      pushNamed(constEntries, `"${bindResult.propName}": ${bindResult.propValue}`, 'const', attr.start);
      if (bindResult.handler) {
        const existing = bindHandlers.get(bindResult.handler.name);
        if (existing) {
          bindHandlers.set(bindResult.handler.name, `[${existing}, ${bindResult.handler.code}]`);
        } else {
          bindHandlers.set(bindResult.handler.name, bindResult.handler.code);
        }
      }
      for (const imp of bindResult.needsImport) {
        neededImports.add(imp);
      }
      continue;
    }

    if (isBindProp(propName) && hasSpreadAttr) {
      pushNamed(varEntries, `"${propName}": ${valueText}`, 'var', attr.start);
      continue;
    }

    if (isEventProp(propName) && tagIsHtml) {
      const renamedProp = transformEventPropName(propName, passiveEvents);
      if (renamedProp !== null) {
        const formattedName = formatPropName(renamedProp);
        if (isConstValueNode(valueNode)) {
          pushNamed(constEntries, `${formattedName}: ${valueText}`, 'const', attr.start);
        } else {
          pushNamed(varEntries, `${formattedName}: ${valueText}`, 'var', attr.start);
          hasVarEventHandler = true;
        }
        continue;
      }
    }

    if (propName.endsWith('$') && !isRewrittenEventProp(propName)) {
      const formattedName = formatPropName(propName);
      if (isConstValueNode(valueNode)) {
        pushNamed(constEntries, `${formattedName}: ${valueText}`, 'const', attr.start);
      } else {
        pushNamed(varEntries, `${formattedName}: ${valueText}`, 'var', attr.start);
      }
      continue;
    }

    if (isRewrittenEventProp(propName)) {
      const formattedName = `"${propName}"`;
      if (inLoop) {
        if (qrlsWithCaptures) {
          const qrlName = valueText.trim();
          if (qrlsWithCaptures.has(qrlName)) {
            pushNamed(varEntries, `${formattedName}: ${valueText}`, 'var', attr.start);
            hasVarEventHandler = true;
          } else {
            pushNamed(constEntries, `${formattedName}: ${valueText}`, 'const', attr.start);
          }
        } else {
          pushNamed(varEntries, `${formattedName}: ${valueText}`, 'var', attr.start);
          hasVarEventHandler = true;
        }
      } else {
        // OSS-434: capture the slot entry at the prop's source position
        // so the source-order var-bag emission path in `buildJsxSplitCall`
        // sees the rewritten event handler in its lexical order. The
        // `bindHandlers` map below still drives the legacy bucket
        // injection — both paths stay in sync.
        const existing = bindHandlers.get(propName);
        const isConst = isConstValueNode(valueNode);
        if (existing) {
          bindHandlers.set(propName, `[${existing}, ${valueText}]`);
        } else {
          bindHandlers.set(propName, valueText);
          slotOrder.push({
            kind: 'named',
            entry: `${formattedName}: ${valueText}`,
            classification: isConst ? 'const' : 'var',
            sourceStart: attr.start,
          });
        }
      }
      continue;
    }

    if (valueNode && !skipSignalAnalysis) {
      const signalResult = analyzeSignalExpression(valueNode, source, importedNames, allDeclaredNames);

      if (signalResult.type === 'wrapProp') {
        const formattedName = formatPropName(propName);
        if (signalResult.isStoreField && tagIsHtml) {
          const objName = signalResult.code.match(/_wrapProp\((\w+)/)?.[1] ?? null;
          const isConst = isConstBindingName(objName, importedNames, bindings, valueNode?.start ?? 0);
          pushNamed(
            isConst ? constEntries : varEntries,
            `${formattedName}: ${signalResult.code}`,
            isConst ? 'const' : 'var',
            attr.start,
          );
        } else {
          pushNamed(constEntries, `${formattedName}: ${signalResult.code}`, 'const', attr.start);
        }
        neededImports.add('_wrapProp');
        continue;
      }

      if (signalResult.type === 'fnSignal') {
        // SWC skips _fnSignal for object expressions on class/className
        if (signalResult.isObjectExpr && (propName === 'class' || propName === 'className')) {
          // fall through to classifyConstness
        } else {
          const hfName = signalHoister.hoist(signalResult.hoistedFn, signalResult.hoistedStr, valueNode.start ?? 0);
          const fnSignalCall = `_fnSignal(${hfName}, [${signalResult.deps.join(', ')}], ${hfName}_str)`;
          const formattedName = formatPropName(propName);
          // Function parameters are stable bindings within the enclosing
          // segment scope, but SWC only treats them as const-eligible deps
          // when the receiving JSX element is a *component* (non-HTML). On
          // HTML elements, `_fnSignal` props that close over a parameter
          // stay in the var bag because the runtime re-renders the DOM
          // element on every prop change. On component elements, the
          // const-props bag's identity-stability matters more than the
          // value-changes-on-rerender concern.
          const depsAllConst = signalResult.deps.every(dep =>
            importedNames.has(dep) ||
            (bindings?.classify(dep, valueNode.start) === 'const') ||
            (!tagIsHtml && (paramNames?.has(dep) ?? false))
          );
          if (depsAllConst && !inLoop) {
            pushNamed(constEntries, `${formattedName}: ${fnSignalCall}`, 'const', attr.start);
          } else {
            pushNamed(varEntries, `${formattedName}: ${fnSignalCall}`, 'var', attr.start);
          }
          neededImports.add('_fnSignal');
          continue;
        }
      }
    }

    const classification = valueNode
      ? classifyConstness(valueNode, importedNames, bindings, valueNode.start)
      : 'const';

    const entry = `${formatPropName(propName)}: ${valueText}`;

    if (beforeSpread) {
      pushNamed(beforeSpreadEntries, entry, classification === 'var' ? 'var' : 'var', attr.start);
    } else if (classification === 'var') {
      pushNamed(varEntries, entry, 'var', attr.start);
    } else {
      pushNamed(constEntries, entry, 'const', attr.start);
    }
  }

  if (!hasSpread) {
    sortVarEntries(varEntries);
  }

  // Merge bind handlers into their target bucket
  const hasBindEntries = varEntries.some(e => e.startsWith('"bind:'));
  const eventTarget = (hasSpread && tagIsHtml && !hasBindEntries) ? varEntries : constEntries;
  for (const [eventName, handlerCode] of bindHandlers) {
    const quotedEventName = `"${eventName}"`;
    const existingIdx = constEntries.findIndex((e) => e.startsWith(`${quotedEventName}: `));
    if (existingIdx >= 0) {
      const existingEntry = constEntries[existingIdx];
      const existingValue = existingEntry.slice(quotedEventName.length + 2);
      constEntries[existingIdx] = `${quotedEventName}: ${mergeEventHandlers(existingValue, handlerCode)}`;
    } else {
      eventTarget.push(`${quotedEventName}: ${handlerCode}`);
    }
  }

  return {
    varEntries,
    constEntries,
    beforeSpreadEntries,
    additionalSpreads,
    key,
    hasVarProps: varEntries.length > 0 || beforeSpreadEntries.length > 0,
    hasVarEventHandler,
    hasSpread,
    slotOrder,
    neededImports,
  };
}

import type { AstMaybeNode, JSXAttributeItem } from '../../ast-types.js';
import { analyzeSignalExpression } from './signal-analysis.js';
import { transformEventPropName, isEventProp, isPassiveDirective } from './event-handlers.js';
import { isBindProp, transformBindProp, mergeEventHandlers } from './bind.js';
import { isCaptureWrappingQrlCall } from '../qwik/w-call.js';
import {
  classifyConstness,
  isConstBindingName,
  fnSignalDepsAllConst,
  sliceTransformed,
  type JsxTransformContext,
  type ProcessPropsOptions,
} from './jsx.js';
import { simplifyExpression, formatSimplifiedLiteral } from './simplify.js';
import { startsWithRewrittenEventPrefix } from '../qwik/event-attrs.js';
import { getJsxAttributeName } from './jsx-attr-name.js';

/**
 * Read a byte range from the transform buffer, falling back to the original
 * `source` when MagicString throws — which happens when the range's start byte
 * lies inside a previously-replaced range (an upstream rewrite overwrote the
 * attribute value before the JSX walker reached the outer element).
 */
function sliceWithFallback(
  ctx: JsxTransformContext,
  start: number,
  end: number,
): string {
  try {
    return sliceTransformed(ctx, start, end);
  } catch {
    return ctx.source.slice(start, end);
  }
}

/**
 * Slot entry — one per JSX attribute in source order. Captures enough for
 * `buildJsxSplitCall` to assemble var/const bags in emit order:
 *
 *   - attributes appear in source order;
 *   - named props with stable values placed AFTER ALL spreads land in the
 *     const-bag; everything else (stable-but-pre-spread and unstable values)
 *     lands in the var-bag at its source position;
 *   - spreads appear as raw `...expr` in the var-bag when the post-all-spreads
 *     const set is non-empty; otherwise the `_getVarProps`/`_getConstProps`
 *     wrappers are needed so the spread's content is classified at runtime.
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

function isConstValueNode(valueNode: AstMaybeNode): boolean {
  if (!valueNode) return true;
  switch (valueNode.type) {
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'Identifier':
    case 'Literal':
      return true;
    case 'CallExpression':
      return isCaptureWrappingQrlCall(valueNode);
    default:
      return false;
  }
}

/**
 * Fold a string-literal JSX attribute value so a value spanning multiple
 * physical lines (or containing tabs) survives re-emission as a single-line
 * JS string literal — raw newlines in an emitted JS string are a syntax error.
 * `quoted` is the raw source slice including its surrounding quotes.
 */
function foldJsxAttrStringWhitespace(quoted: string): string {
  const quote = quoted[0];
  const interior = quoted.slice(1, -1);
  const lines = interior.split(/\r\n|\r|\n/);
  const folded = lines
    .map((line, i) => {
      let l = line.replace(/\t/g, ' ');
      if (i > 0) l = l.replace(/^ +/, '');
      if (i < lines.length - 1) l = l.replace(/ +$/, '');
      return l;
    })
    .join(' ');
  return `${quote}${folded}${quote}`;
}

export function isRewrittenEventEntry(entry: string): boolean {
  return entry.startsWith('"') && startsWithRewrittenEventPrefix(entry.slice(1));
}

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

  // Dual-write the legacy buckets and `slotOrder` at every push so the many
  // existing bucket readers (event-handler movement, `buildJsxSplitCall`,
  // `_jsxSorted` emit) don't need to change.
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

    let propName = getJsxAttributeName(attr);

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
      // Prefer the post-rewrite buffer over raw source: DFS leaves children
      // before the parent, so JSX nested in this attribute's arrow body is
      // already overwritten in `s`; slicing raw `source` would re-emit the
      // original JSX and the outer element's overwrite would clobber the inner
      // rewrites. The fallback covers value bytes inside a replaced range,
      // where MagicString throws on the slice anchor.
      valueText = sliceWithFallback(ctx, valueNode.start, valueNode.end);
      // Fold compile-time-constant prop expressions to their literal result,
      // so `prop={'true' + 1 ? 'true' : ''}` emits as `prop: 'true'` instead
      // of `prop: "true" + 1 ? "true" : ""`.
      const simplified = simplifyExpression(valueNode);
      if (simplified.simplified) {
        valueText = formatSimplifiedLiteral(simplified.value);
      }
    } else {
      valueNode = attr.value;
      valueText = sliceWithFallback(ctx, attr.value.start, attr.value.end);
      // Only fold when a newline/tab/CR is present, so single-line values keep
      // their exact source bytes.
      if (attr.value.type === 'Literal' && /[\n\r\t]/.test(valueText)) {
        valueText = foldJsxAttrStringWhitespace(valueText);
      }
    }

    if (isBindProp(propName) && !tagIsHtml) {
      let bindValue = valueText;
      if (valueNode && !skipSignalAnalysis) {
        const bindSignal = analyzeSignalExpression(valueNode, source, importedNames, allDeclaredNames);
        if (bindSignal.type === 'wrapProp' && bindSignal.isStoreField) {
          bindValue = bindSignal.code;
          neededImports.add('_wrapProp');
        }
      }
      pushNamed(constEntries, `"${propName}": ${bindValue}`, 'const', attr.start);
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

    if (propName.endsWith('$') && !startsWithRewrittenEventPrefix(propName)) {
      const formattedName = formatPropName(propName);
      if (isConstValueNode(valueNode)) {
        pushNamed(constEntries, `${formattedName}: ${valueText}`, 'const', attr.start);
      } else {
        pushNamed(varEntries, `${formattedName}: ${valueText}`, 'var', attr.start);
        // A non-const prop value clears the static_listeners bit; the flag math
        // reads `hasVarEventHandler` for bit 0, so set it here for Component-prop
        // `*$` attrs with non-const values.
        hasVarEventHandler = true;
      }
      continue;
    }

    if (startsWithRewrittenEventPrefix(propName)) {
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
        // Record the slot at the prop's source position so `buildJsxSplitCall`'s
        // source-order emission sees the rewritten handler in lexical order; the
        // `bindHandlers` map still drives the legacy bucket injection.
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
        const isParam = (dep: string) => paramNames?.has(dep) ?? false;
        const isRawWhenNonConst =
          valueNode?.type === 'TemplateLiteral' || valueNode?.type === 'CallExpression';
        const excludedFromHoist =
          (signalResult.isObjectExpr && (propName === 'class' || propName === 'className')) ||
          (isRawWhenNonConst &&
            !fnSignalDepsAllConst(
              signalResult.deps, importedNames, bindings, valueNode.start, tagIsHtml, isParam,
            ));
        if (!excludedFromHoist) {
          const hfName = signalHoister.hoist(signalResult.hoistedFn, signalResult.hoistedStr, valueNode.start ?? 0);
          const fnSignalCall = `_fnSignal(${hfName}, [${signalResult.deps.join(', ')}], ${hfName}_str)`;
          const formattedName = formatPropName(propName);
          const depsAllConst = fnSignalDepsAllConst(
            signalResult.deps, importedNames, bindings, valueNode.start, tagIsHtml, isParam,
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

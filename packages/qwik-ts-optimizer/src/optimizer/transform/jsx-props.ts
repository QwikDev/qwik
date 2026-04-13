/**
 * JSX attribute/prop processing for the Qwik optimizer.
 *
 * Classifies JSX attributes into varProps and constProps, handles event
 * handler transformation, bind desugaring, spread attributes, and
 * signal analysis for prop values.
 */

import { analyzeSignalExpression, type SignalHoister } from '../signal-analysis.js';
import { transformEventPropName, isEventProp, isPassiveDirective } from './event-handlers.js';
import { isBindProp, transformBindProp, mergeEventHandlers } from './bind.js';
import { classifyProp, isConstBindingName } from './jsx.js';

/** True for value nodes that are always const (literals, arrows, identifiers). */
function isConstValueNode(valueNode: any): boolean {
  if (!valueNode) return true;
  switch (valueNode.type) {
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'Identifier':
    case 'Literal':
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
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
  attributes: any[],
  source: string,
  importedNames: Set<string>,
  tagIsHtml: boolean,
  passiveEvents: Set<string>,
  signalHoister: SignalHoister,
  inLoop?: boolean,
  qrlsWithCaptures?: Set<string>,
  _paramNames?: Set<string>,
  constIdents?: Set<string>,
  allDeclaredNames?: Set<string>,
  skipSignalAnalysis?: boolean,
): {
  varEntries: string[];
  constEntries: string[];
  beforeSpreadEntries: string[];
  key: string | null;
  hasVarProps: boolean;
  hasVarEventHandler: boolean;
  hasSpread: boolean;
  additionalSpreads: string[];
  neededImports: Set<string>;
} {
  const varEntries: string[] = [];
  const constEntries: string[] = [];
  const beforeSpreadEntries: string[] = [];
  const neededImports = new Set<string>();
  let key: string | null = null;
  let hasSpread = false;
  let hasVarEventHandler = false;
  const bindHandlers = new Map<string, string>();

  if (!attributes || attributes.length === 0) {
    return { varEntries, constEntries, beforeSpreadEntries, key, hasVarProps: false, hasVarEventHandler: false, hasSpread, additionalSpreads: [], neededImports };
  }

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
      if (spreadCount > 1) {
        additionalSpreads.push(source.slice(attr.argument.start, attr.argument.end));
      }
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
        } else if (attr.value.type === 'StringLiteral' || attr.value.type === 'Literal') {
          key = `"${attr.value.value}"`;
        }
      }
      continue;
    }

    if (isPassiveDirective(propName)) continue;

    if (propName.startsWith('preventdefault:')) {
      // Only emit when no matching passive:EVENT on the same element
      const eventName = propName.slice('preventdefault:'.length);
      if (!passiveEvents.has(eventName)) {
        constEntries.push(`"${propName}": true`);
      }
      continue;
    }

    let valueText: string;
    let valueNode: any;

    if (attr.value === null || attr.value === undefined) {
      valueText = 'true';
      valueNode = null;
    } else if (attr.value.type === 'JSXExpressionContainer') {
      valueNode = attr.value.expression;
      valueText = source.slice(valueNode.start, valueNode.end);
    } else {
      valueNode = attr.value;
      valueText = source.slice(attr.value.start, attr.value.end);
    }

    // Bind desugaring: component tags keep bind: as-is for _jsxSplit
    if (isBindProp(propName) && !tagIsHtml) {
      constEntries.push(`"${propName}": ${valueText}`);
      continue;
    }

    if (isBindProp(propName) && !hasSpreadAttr) {
      const bindResult = transformBindProp(propName, valueText);
      constEntries.push(`"${bindResult.propName}": ${bindResult.propValue}`);
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
      varEntries.push(`"${propName}": ${valueText}`);
      continue;
    }

    if (isEventProp(propName) && tagIsHtml) {
      const renamedProp = transformEventPropName(propName, passiveEvents);
      if (renamedProp !== null) {
        const formattedName = formatPropName(renamedProp);
        if (isConstValueNode(valueNode)) {
          constEntries.push(`${formattedName}: ${valueText}`);
        } else {
          varEntries.push(`${formattedName}: ${valueText}`);
          hasVarEventHandler = true;
        }
        continue;
      }
    }

    // QRL prop passthrough ($-suffixed props not already handled as events)
    if (propName.endsWith('$') && !isRewrittenEventProp(propName)) {
      const formattedName = formatPropName(propName);
      if (isConstValueNode(valueNode)) {
        constEntries.push(`${formattedName}: ${valueText}`);
      } else {
        varEntries.push(`${formattedName}: ${valueText}`);
      }
      continue;
    }

    // Pre-rewritten event props from extraction rewriting
    if (isRewrittenEventProp(propName)) {
      const formattedName = `"${propName}"`;
      if (inLoop) {
        if (qrlsWithCaptures) {
          const qrlName = valueText.trim();
          if (qrlsWithCaptures.has(qrlName)) {
            varEntries.push(`${formattedName}: ${valueText}`);
          } else {
            constEntries.push(`${formattedName}: ${valueText}`);
          }
        } else {
          varEntries.push(`${formattedName}: ${valueText}`);
        }
      } else {
        // Outside loop: track for merging with bind handlers
        const existing = bindHandlers.get(propName);
        if (existing) {
          bindHandlers.set(propName, `[${existing}, ${valueText}]`);
        } else {
          bindHandlers.set(propName, valueText);
        }
      }
      continue;
    }

    // Signal analysis (skipped for _createElement path)
    if (valueNode && !skipSignalAnalysis) {
      const signalResult = analyzeSignalExpression(valueNode, source, importedNames, allDeclaredNames);

      if (signalResult.type === 'wrapProp') {
        const formattedName = formatPropName(propName);
        if (signalResult.isStoreField && tagIsHtml) {
          const objName = signalResult.code.match(/_wrapProp\((\w+)/)?.[1] ?? null;
          const isConst = isConstBindingName(objName, importedNames, constIdents);
          (isConst ? constEntries : varEntries).push(`${formattedName}: ${signalResult.code}`);
        } else {
          constEntries.push(`${formattedName}: ${signalResult.code}`);
        }
        neededImports.add('_wrapProp');
        continue;
      }

      if (signalResult.type === 'fnSignal') {
        // SWC skips _fnSignal for object expressions on class/className props
        if (signalResult.isObjectExpr && (propName === 'class' || propName === 'className')) {
          // Fall through to classifyProp
        } else {
          const hfName = signalHoister.hoist(signalResult.hoistedFn, signalResult.hoistedStr, valueNode.start ?? 0);
          const fnSignalCall = `_fnSignal(${hfName}, [${signalResult.deps.join(', ')}], ${hfName}_str)`;
          const formattedName = formatPropName(propName);
          const depsAllConst = signalResult.deps.every(dep =>
            importedNames.has(dep) || (constIdents?.has(dep) ?? false)
          );
          if (depsAllConst && !inLoop) {
            constEntries.push(`${formattedName}: ${fnSignalCall}`);
          } else {
            varEntries.push(`${formattedName}: ${fnSignalCall}`);
          }
          neededImports.add('_fnSignal');
          continue;
        }
      }
    }

    // Default: classify by expression constness
    const classification = valueNode
      ? classifyProp(valueNode, importedNames, constIdents)
      : 'const';

    const entry = `${formatPropName(propName)}: ${valueText}`;

    if (beforeSpread) {
      beforeSpreadEntries.push(entry);
    } else if (classification === 'var') {
      varEntries.push(entry);
    } else {
      constEntries.push(entry);
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
    neededImports,
  };
}

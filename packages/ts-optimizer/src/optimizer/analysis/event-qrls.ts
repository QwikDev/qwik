import { isReferenceIdentifier, walk, type ScopeTrackerNode } from 'oxc-walker';
import type { AstNode, AstProgram } from '../../ast-types.js';
import type { ExtractionResult } from '../extraction/extract.js';
import { collectImports } from '../extraction/marker-detection.js';
import { getObjectPropertyKeyName, memberStaticPropName } from '../ast/guards.js';
import { getJsxAttributeName } from '../jsx/jsx-attr-name.js';
import { isEventProp } from '../jsx/event-handlers.js';
import { isHtmlElement } from '../jsx/jsx.js';
import { collectJsxFunctionNamesFromIterable } from '../jsx/jsx-call-transform.js';
import { ScopeQueryTracker } from './scope-query-tracker.js';

type Binding = ScopeTrackerNode;
type Uses = { event: boolean; blocked: boolean; sources: Set<Binding> };

/** Unknown consumers retain render grouping instead of risking a waterfall. */
export function collectEventOnlyQrls(
  program: AstProgram,
  extractions: readonly ExtractionResult[]
): Set<number> {
  if (!extractions.some((ext) => ext.isBare || ext.isInlinedQrl)) {
    return new Set();
  }
  const tracker = new ScopeQueryTracker({ preserveExitedScopes: true });
  const scopes = new Map<AstNode, string>();
  const parents = new Map<AstNode, AstNode>();
  const references: AstNode[] = [];
  const declarations: AstNode[] = [];
  const eventValues: AstNode[] = [];
  const calls: AstNode[] = [];
  walk(program, {
    scopeTracker: tracker,
    enter(node, parent) {
      scopes.set(node, tracker.getCurrentScope());
      if (parent) {
        parents.set(node, parent);
      }
      if (node.type === 'VariableDeclarator') {
        declarations.push(node);
      }
      if (node.type === 'CallExpression') {
        calls.push(node);
      }
      if (
        (node.type === 'Identifier' || node.type === 'JSXIdentifier') &&
        (isReferenceIdentifier(node, parent) ||
          (parent?.type === 'ExportSpecifier' && parent.local === node))
      ) {
        references.push(node);
      }
      if (
        node.type === 'JSXAttribute' &&
        parent?.type === 'JSXOpeningElement' &&
        parent.name.type === 'JSXIdentifier' &&
        isHtmlElement(parent.name.name) &&
        isEventProp(getJsxAttributeName(node)) &&
        node.value?.type === 'JSXExpressionContainer'
      ) {
        eventValues.push(node.value.expression);
      }
    },
  });
  tracker.freeze();
  const binding = (node: AstNode): Binding | null =>
    node.type === 'Identifier' || node.type === 'JSXIdentifier'
      ? tracker.getDeclarationFromScope(node.name, scopes.get(node) ?? '')
      : null;
  const imports = collectImports(program);
  const jsxFunctions = collectJsxFunctionNamesFromIterable(imports.values());
  const optimizedJsx = new Set<string>();
  for (const imp of imports.values()) {
    if (
      imp.source === '@qwik.dev/core' &&
      (imp.importedName === '_jsxSorted' || imp.importedName === '_jsxSplit')
    ) {
      jsxFunctions.add(imp.localName);
      optimizedJsx.add(imp.localName);
    }
  }
  for (const call of calls) {
    if (
      call.type !== 'CallExpression' ||
      call.callee.type !== 'Identifier' ||
      !jsxFunctions.has(call.callee.name) ||
      binding(call.callee)?.type !== 'Import' ||
      call.arguments[0]?.type !== 'Literal' ||
      typeof call.arguments[0].value !== 'string'
    ) {
      continue;
    }
    for (const props of call.arguments.slice(1, optimizedJsx.has(call.callee.name) ? 3 : 2)) {
      if (props.type !== 'ObjectExpression') {
        continue;
      }
      for (const prop of props.properties) {
        if (prop.type !== 'Property' || prop.kind !== 'init' || prop.computed) {
          continue;
        }
        const name = getObjectPropertyKeyName(prop.key) ?? '';
        if (isEventProp(name) || /^q-[edw]p?:/.test(name)) {
          eventValues.push(prop.value);
        }
      }
    }
  }
  const allowed = new Set<AstNode>();
  const deferred = new Set<AstNode>();
  const markEventValue = (node: AstNode) => {
    if (node.type === 'Identifier') {
      allowed.add(node);
    } else if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
      deferred.add(node);
    } else if (node.type === 'ParenthesizedExpression') {
      markEventValue(node.expression);
    } else if (node.type === 'ArrayExpression') {
      node.elements.forEach((element) => {
        if (element && element.type !== 'SpreadElement') {
          markEventValue(element);
        }
      });
    } else if (node.type === 'ConditionalExpression') {
      markEventValue(node.consequent);
      markEventValue(node.alternate);
    }
  };
  eventValues.forEach(markEventValue);
  const deferredNodes = new Map<AstNode, boolean>();
  const isDeferred = (node: AstNode): boolean => {
    const path: AstNode[] = [];
    let current: AstNode | undefined = node;
    while (current && !deferredNodes.has(current) && !deferred.has(current)) {
      path.push(current);
      current = parents.get(current);
    }
    const value = current ? deferred.has(current) || deferredNodes.get(current)! : false;
    path.forEach((ancestor) => deferredNodes.set(ancestor, value));
    return value;
  };
  const uses = new Map<Binding, Uses>();
  const getUses = (key: Binding): Uses => {
    let value = uses.get(key);
    if (!value) {
      value = { event: false, blocked: false, sources: new Set() };
      uses.set(key, value);
    }
    return value;
  };
  const candidates = new Map<Binding, number>();
  const aliases = new Map<AstNode, Binding>();
  const byCall = new Map(
    extractions
      .filter((ext) => ext.isBare || ext.isInlinedQrl)
      .map((ext) => [Number(ext.callStart), ext])
  );
  for (const decl of declarations) {
    if (
      decl.type !== 'VariableDeclarator' ||
      decl.id.type !== 'Identifier' ||
      !decl.init ||
      parents.get(decl)?.type !== 'VariableDeclaration'
    ) {
      continue;
    }
    const key = binding(decl.id);
    if (!key || key.type !== 'Variable' || key.variableNode.kind !== 'const') {
      continue;
    }
    let init = decl.init;
    if (
      init.type === 'CallExpression' &&
      memberStaticPropName(init.callee) === 'w' &&
      init.callee.type === 'MemberExpression'
    ) {
      init = init.callee.object;
    }
    if (init.type === 'Identifier') {
      aliases.set(init, key);
    } else if (init.type === 'CallExpression') {
      const extraction = byCall.get(init.start);
      if (extraction) {
        candidates.set(key, extraction.argStart);
      }
    }
  }
  for (const node of references) {
    const key = binding(node);
    if (!key) {
      continue;
    }
    const usage = getUses(key);
    const alias = aliases.get(node);
    if (alias) {
      getUses(alias).sources.add(key);
    } else if (allowed.has(node) || isDeferred(node)) {
      usage.event = true;
    } else {
      usage.blocked = true;
    }
  }
  const propagate = (flag: 'event' | 'blocked') => {
    const queue = [...uses].filter(([, value]) => value[flag]).map(([key]) => key);
    for (let i = 0; i < queue.length; i++) {
      for (const source of getUses(queue[i]).sources) {
        if (!getUses(source)[flag]) {
          getUses(source)[flag] = true;
          queue.push(source);
        }
      }
    }
  };
  propagate('event');
  propagate('blocked');
  return new Set(
    [...candidates]
      .filter(([key]) => getUses(key).event && !getUses(key).blocked)
      .map(([, position]) => position)
  );
}

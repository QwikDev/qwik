import type { Node } from 'oxc-parser';
import type { LocalId, ModulePlan } from '../schema';
import type { BindingGraph } from './ast/bindings';
import { unwrapExpression } from './ast/utils';
import { eventScopeName } from './events';

interface Uses {
  event: boolean;
  blocked: boolean;
  /** Bindings a `const alias = binding` declaration hands its uses back to. */
  sources: Set<LocalId>;
}

/**
 * A `const x = $(...)` that only element event handlers read loads with the event, never with the
 * render, as the v2 optimizers decide; an unknown use keeps it in the render group.
 */
export function recordEventOnlyQrls(plan: ModulePlan, bindings: BindingGraph): void {
  const candidates = new Map<LocalId, ModulePlan['qrls'][number]>();
  const uses = new Map<LocalId, Uses>();
  const usesOf = (binding: LocalId): Uses => {
    let value = uses.get(binding);
    if (value === undefined) {
      value = { event: false, blocked: false, sources: new Set() };
      uses.set(binding, value);
    }
    return value;
  };
  const aliasInits = new Map<Node, LocalId>();
  for (let binding = 0; binding < bindings.bindings.length; binding++) {
    const [declaration] = bindings.declarationsOf(binding);
    if (!isConstDeclarator(declaration, bindings)) {
      continue;
    }
    const init = qrlBase(unwrapExpression(declaration.init!));
    if (init.type === 'Identifier') {
      aliasInits.set(init, binding);
      continue;
    }
    const qrl = plan.qrls.find(
      (entry) => entry.origin.range[0] === init.start && entry.origin.range[1] === init.end
    );
    if (qrl !== undefined) {
      candidates.set(binding, qrl);
    }
  }
  if (candidates.size === 0) {
    return;
  }
  for (let binding = 0; binding < bindings.bindings.length; binding++) {
    for (const { node } of bindings.referencesOf(binding)) {
      const alias = aliasInits.get(node);
      if (alias !== undefined) {
        usesOf(alias).sources.add(binding);
      } else if (isEventUse(node, bindings)) {
        usesOf(binding).event = true;
      } else {
        usesOf(binding).blocked = true;
      }
    }
  }
  for (const flag of ['event', 'blocked'] as const) {
    const queue = [...uses].filter(([, value]) => value[flag]).map(([binding]) => binding);
    for (let i = 0; i < queue.length; i++) {
      for (const source of usesOf(queue[i]).sources) {
        if (!usesOf(source)[flag]) {
          usesOf(source)[flag] = true;
          queue.push(source);
        }
      }
    }
  }
  for (const [binding, qrl] of candidates) {
    const use = usesOf(binding);
    if (use.event && !use.blocked) {
      qrl.eventOnly = true;
    }
  }
}

function isConstDeclarator(
  node: Node | undefined,
  bindings: BindingGraph
): node is Extract<Node, { type: 'VariableDeclarator' }> {
  if (node?.type !== 'VariableDeclarator' || node.id.type !== 'Identifier' || node.init === null) {
    return false;
  }
  const declaration = bindings.parentOf(node);
  return declaration?.type === 'VariableDeclaration' && declaration.kind === 'const';
}

/** `qrl.w([...])` binds captures to the same QRL. */
function qrlBase(node: Node): Node {
  return node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'w'
    ? unwrapExpression(node.callee.object)
    : node;
}

/** The value of an element's event prop, or code inside a handler such a prop holds. */
function isEventUse(node: Node, bindings: BindingGraph): boolean {
  if (isEventValue(node, bindings)) {
    return true;
  }
  // Anything else inside the prop's expression runs during the render.
  for (
    let current = bindings.parentOf(node);
    current !== null;
    current = bindings.parentOf(current)
  ) {
    if (
      (current.type === 'ArrowFunctionExpression' || current.type === 'FunctionExpression') &&
      isEventValue(current, bindings)
    ) {
      return true;
    }
  }
  return false;
}

function isEventValue(node: Node, bindings: BindingGraph): boolean {
  let value = node;
  let parent = bindings.parentOf(value);
  // A list, a branch or parentheses still hand the value to the event.
  while (
    parent !== null &&
    (parent.type === 'ParenthesizedExpression' ||
      parent.type === 'ArrayExpression' ||
      (parent.type === 'ConditionalExpression' && parent.test !== value))
  ) {
    value = parent;
    parent = bindings.parentOf(value);
  }
  if (parent?.type !== 'JSXExpressionContainer') {
    return false;
  }
  const attribute = bindings.parentOf(parent);
  const element = attribute === null ? null : bindings.parentOf(attribute);
  return (
    attribute?.type === 'JSXAttribute' &&
    attribute.name.type === 'JSXIdentifier' &&
    eventScopeName(attribute.name.name) !== null &&
    element?.type === 'JSXOpeningElement' &&
    element.name.type === 'JSXIdentifier' &&
    /^[a-z]/.test(element.name.name)
  );
}

/**
 * `import.meta.env.SSR`, `.DEV` and `.PROD` are the same build answers the named imports give, so
 * they fold the same way. The read is not a binding reference, so a pass over the program finds it
 * and hands it to the innermost payload that prints it.
 */
import { BuildConstant, PredicateKind, ReadRole, type ModulePlan, type Predicate } from '../schema';
import { isNode, type WalkableNode } from './ast/ast-types';
import type { MemberExpression, Node } from 'oxc-parser';

const ENV_CONSTANTS: Record<string, Predicate> = {
  SSR: { p: PredicateKind.Const, name: BuildConstant.IsServer },
  DEV: { p: PredicateKind.Const, name: BuildConstant.IsDev },
  PROD: { p: PredicateKind.Not, operand: { p: PredicateKind.Const, name: BuildConstant.IsDev } },
};

export function recordEnvConstants(program: Node, plan: ModulePlan): void {
  for (const { node, predicate } of findEnvReads(program)) {
    let target: ModulePlan['payloads'][number] | null = null;
    for (const payload of plan.payloads) {
      const [start, end] = payload.range;
      if (start > node.start || end < node.end) {
        continue;
      }
      if (target === null || end - start < target.range[1] - target.range[0]) {
        target = payload;
      }
    }
    target?.constants.push({
      range: [node.start, node.end],
      predicate,
      role: ReadRole.Read,
    });
  }
}

function findEnvReads(
  node: unknown,
  found: { node: MemberExpression; predicate: Predicate }[] = []
): { node: MemberExpression; predicate: Predicate }[] {
  if (Array.isArray(node)) {
    for (const child of node) {
      findEnvReads(child, found);
    }
    return found;
  }
  if (!isNode(node)) {
    return found;
  }
  if (node.type === 'MemberExpression') {
    const member = node as unknown as MemberExpression;
    const predicate = envConstantOf(member);
    if (predicate !== undefined) {
      found.push({ node: member, predicate });
      return found;
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'range') {
      continue;
    }
    findEnvReads((node as WalkableNode)[key], found);
  }
  return found;
}

/** Exactly `import.meta.env.<NAME>`; a computed or deeper path stays authored. */
function envConstantOf(node: MemberExpression): Predicate | undefined {
  if (node.computed || node.property.type !== 'Identifier') {
    return undefined;
  }
  const env = node.object;
  if (
    env.type !== 'MemberExpression' ||
    env.computed ||
    env.property.type !== 'Identifier' ||
    env.property.name !== 'env' ||
    env.object.type !== 'MetaProperty'
  ) {
    return undefined;
  }
  return ENV_CONSTANTS[node.property.name];
}

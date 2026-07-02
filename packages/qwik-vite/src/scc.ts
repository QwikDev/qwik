import type { QwikBundle } from './types';

export interface CondensedGraph {
  componentOf: Map<string, number>;
  components: string[][];
  /** Component -> successor components (DAG edges; no self-loops). */
  successors: Set<number>[];
}

/** Tarjan strongly-connected-component condensation; the component graph is a DAG. */
export function condenseImportGraph(graph: Record<string, QwikBundle>): CondensedGraph {
  const componentOf = new Map<string, number>();
  const index = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  const strongConnect = (node: string) => {
    index.set(node, counter);
    lowLink.set(node, counter);
    counter++;
    stack.push(node);
    onStack.add(node);
    for (const next of graph[node].imports || []) {
      if (!graph[next]) {
        continue;
      }
      if (!index.has(next)) {
        strongConnect(next);
        lowLink.set(node, Math.min(lowLink.get(node)!, lowLink.get(next)!));
      } else if (onStack.has(next)) {
        lowLink.set(node, Math.min(lowLink.get(node)!, index.get(next)!));
      }
    }
    if (lowLink.get(node) === index.get(node)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        componentOf.set(member, components.length);
        component.push(member);
      } while (member !== node);
      components.push(component);
    }
  };

  for (const node of Object.keys(graph)) {
    if (!index.has(node)) {
      strongConnect(node);
    }
  }

  const successors: Set<number>[] = Array.from({ length: components.length }, () => new Set());
  for (const node of Object.keys(graph)) {
    const from = componentOf.get(node)!;
    for (const next of graph[node].imports || []) {
      const to = componentOf.get(next);
      if (to !== undefined && to !== from) {
        successors[from].add(to);
      }
    }
  }

  return { componentOf, components, successors };
}

import type { Container } from '../shared/types';
import type { BranchRange } from './dom/branch/branch';
import { createTextExpressionEffect } from './dom/effect/effect';
import { ReactiveFlags } from './reactive/flags';
import { Phase, type Scheduler } from './runtime/scheduler';
import {
  SubscriberKind,
  type DomSubscriber,
  type IdleSubscriber,
  type TaskSubscriber,
} from './runtime/subscriber';
import { createTask, createTaskGroup } from './runtime/task';

export const noopSchedule = (): void => {};

export function createText(data = ''): Text {
  return { data } as Text;
}

export function createNode(label: string): Node {
  return { label } as unknown as Node;
}

export function getNodeLabel(node: Node): string {
  return (node as unknown as { label: string }).label;
}

export function createBranchRange(): { range: BranchRange; replacements: Node[][] } {
  const replacements: Node[][] = [];
  return {
    range: {
      replace(nodes: readonly Node[]) {
        replacements.push([...nodes]);
      },
    },
    replacements,
  };
}

export interface TestParentNode extends Node {
  nodes: TestDomNode[];
}

export interface TestDomNode extends Node {
  label: string;
  parent: TestParentNode | null;
}

export interface TestDocumentFragment extends DocumentFragment {
  isTestFragment: true;
  nodes: TestDomNode[];
}

const testDocument = {
  createRange(): Range {
    let start: TestDomNode | null = null;
    let end: TestDomNode | null = null;

    return {
      setStartAfter(node: Node): void {
        start = node as TestDomNode;
      },
      setEndBefore(node: Node): void {
        end = node as TestDomNode;
      },
      deleteContents(): void {
        if (start === null || end === null) {
          throw new Error('Incomplete range');
        }

        const parent = start.parent;
        if (parent === null || parent !== end.parent) {
          throw new Error('Range markers must share parent');
        }

        let child = start.nextSibling as TestDomNode | null;
        while (child !== end) {
          if (child === null) {
            throw new Error('Range end not found');
          }

          const next = child.nextSibling as TestDomNode | null;
          parent.removeChild(child);
          child = next;
        }
      },
    } as unknown as Range;
  },
  createDocumentFragment(): DocumentFragment {
    return createTestDocumentFragment();
  },
} as Document;

function createTestDocumentFragment(): TestDocumentFragment {
  const fragment = {
    isTestFragment: true,
    nodes: [] as TestDomNode[],
    appendChild(node: Node): Node {
      const child = node as TestDomNode;
      const currentParent = child.parent;
      if (currentParent !== null) {
        currentParent.removeChild(child);
      }

      fragment.nodes.push(child);
      child.parent = null;
      return node;
    },
  } as unknown as TestDocumentFragment;

  return fragment;
}

function isTestDocumentFragment(node: Node): node is TestDocumentFragment {
  return (node as Partial<TestDocumentFragment>).isTestFragment === true;
}

export function createTestDomNode(label: string): TestDomNode {
  return {
    label,
    parent: null,
    get ownerDocument() {
      return testDocument;
    },
    get parentNode() {
      return this.parent;
    },
    get nextSibling() {
      const parent = this.parent;
      if (parent === null) {
        return null;
      }

      const index = parent.nodes.indexOf(this);
      return parent.nodes[index + 1] ?? null;
    },
  } as TestDomNode;
}

export function createTestParentNode(nodes: TestDomNode[]): TestParentNode {
  const parent = {
    nodes: [] as TestDomNode[],
    removeChild(node: Node): Node {
      const child = node as TestDomNode;
      const index = parent.nodes.indexOf(child);
      if (index === -1) {
        throw new Error('Missing child');
      }

      parent.nodes.splice(index, 1);
      child.parent = null;
      return node;
    },
    insertBefore(node: Node, before: Node | null): Node {
      if (isTestDocumentFragment(node)) {
        for (let i = 0; i < node.nodes.length; i++) {
          parent.insertBefore(node.nodes[i], before);
        }
        node.nodes.length = 0;
        return node;
      }

      const child = node as TestDomNode;
      const beforeIndex =
        before === null ? parent.nodes.length : parent.nodes.indexOf(before as TestDomNode);
      if (beforeIndex === -1) {
        throw new Error('Missing reference child');
      }

      const currentParent = child.parent;
      if (currentParent !== null) {
        currentParent.removeChild(child);
      }

      parent.nodes.splice(beforeIndex, 0, child);
      child.parent = parent;
      return node;
    },
  } as unknown as TestParentNode;

  for (let i = 0; i < nodes.length; i++) {
    parent.nodes.push(nodes[i]);
    nodes[i].parent = parent;
  }

  return parent;
}

export function createAttrTarget(): { element: Element; attrs: Map<string, string> } {
  const attrs = new Map<string, string>();
  return {
    element: {
      setAttribute(name: string, value: string) {
        attrs.set(name, value);
      },
    } as Element,
    attrs,
  };
}

export function createCaptureContainer(captures: Record<string, unknown>): Container {
  return {
    $getObjectById$: (id: number | string) => captures[String(id)],
  } as Container;
}

export function createTaskSubscriber(
  scheduler: Scheduler,
  label: string,
  order: string[],
  groupPath: readonly number[] = [0],
  index = 0
): TaskSubscriber {
  return createTask(() => order.push(label), {
    scheduler,
    group: createTaskGroup(groupPath),
    index,
  });
}

export function createOrderTextExpressionEffect(
  scheduler: Scheduler,
  phase: Phase.StructuralDom | Phase.ScalarDom,
  label: string,
  order: string[],
  orderIndex = 0
): DomSubscriber {
  return createTextExpressionEffect(
    createText(),
    [],
    () => {
      order.push(label);
      return label;
    },
    {
      scheduler,
      phase,
      order: orderIndex,
    }
  );
}

export function createIdleSubscriber(notify: () => void): IdleSubscriber {
  return {
    kind: SubscriberKind.Idle,
    job: {
      run() {},
    },
    flags: ReactiveFlags.None,
    schedulerEpoch: 0,
    notify,
  };
}

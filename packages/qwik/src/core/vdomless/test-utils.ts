import { createDocument } from '../../testing/document';
import { QContainerValue, type Container } from '../shared/types';
import { escapeHTML } from '../shared/utils/character-escaping';
import { QContainerAttr } from '../shared/utils/markers';
import { createComponent } from './component/component';
import type { BranchRange } from './dom/branch/branch';
import {
  createTextExpressionEffect,
  type TextExpressionFn,
  type TextExpressionValue,
} from './dom/effect/effect';
import { ReactiveFlags } from './reactive/flags';
import { createOwner, disposeOwner } from './runtime/owner';
import { newInvokeContext } from './runtime/invoke-context';
import { Phase, Scheduler } from './runtime/scheduler';
import {
  SubscriberKind,
  type DomSubscriber,
  type IdleSubscriber,
  type TaskSubscriber,
} from './runtime/subscriber';
import { createTask, createTaskGroup } from './runtime/task';

export const noopSchedule = (): void => {};

export type RenderMode = 'csr' | 'ssr';

export type SsrTextExpression = <TArgs extends unknown[]>(
  args: TArgs,
  fn: TextExpressionFn<TArgs>
) => string;

export interface BaseRenderContext<TMode extends RenderMode> {
  document: Document;
  scheduler: Scheduler;
  mode: TMode;
  qContainer: Container;
}

export interface CsrRenderContext extends BaseRenderContext<'csr'> {}

export interface SsrRenderContext extends BaseRenderContext<'ssr'> {
  textExpression: SsrTextExpression;
}

export type RenderContext<TMode extends RenderMode = RenderMode> = TMode extends 'csr'
  ? CsrRenderContext
  : TMode extends 'ssr'
    ? SsrRenderContext
    : CsrRenderContext | SsrRenderContext;

export type CsrRenderComponent<TProps = undefined> = (
  props: TProps,
  ctx: RenderContext<'csr'>
) => readonly Node[] | void;

export type SsrRenderComponent<TProps = undefined> = (
  props: TProps,
  ctx: RenderContext<'ssr'>
) => string;

export interface RenderOptions {
  qContainer?: Container;
  captures?: Record<string, unknown>;
  scheduler?: Scheduler;
}

export interface RenderResult {
  document: Document;
  container: HTMLElement;
  html: string;
  nodes: readonly Node[];
  scheduler: Scheduler;
  flush: () => Promise<void>;
  cleanup: () => void;
}

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

export async function csrRender<TProps = undefined>(
  component: CsrRenderComponent<TProps>,
  props?: TProps,
  options?: RenderOptions
): Promise<RenderResult> {
  const document = createDocument();
  const container = document.createElement('div');
  container.setAttribute(QContainerAttr, QContainerValue.RESUMED);
  document.body.appendChild(container);

  const state = runCsrComponent(component, props as TProps, document, options);
  const nodes = [...state.output];
  for (let i = 0; i < nodes.length; i++) {
    container.appendChild(nodes[i]);
  }

  const cleanup = createRenderCleanup(state.cleanup, container);
  const result = createRenderResult(document, container, nodes, state.scheduler, cleanup);
  await result.flush();

  return {
    ...result,
    html: container.innerHTML,
  };
}

export async function ssrRender<TProps = undefined>(
  component: SsrRenderComponent<TProps>,
  props?: TProps,
  options?: RenderOptions
): Promise<RenderResult> {
  const renderDocument = createDocument();
  const state = runSsrComponent(component, props as TProps, renderDocument, options);
  await flushScheduler(state.scheduler);

  const { document, container } = createContainerDocument(state.output, QContainerValue.PAUSED);
  const nodes = Array.from(container.childNodes) as Node[];
  const cleanup = createRenderCleanup(state.cleanup, container);

  return {
    ...createRenderResult(document, container, nodes, state.scheduler, cleanup),
    html: container.innerHTML,
  };
}

interface CsrRenderState {
  output: readonly Node[];
  scheduler: Scheduler;
  cleanup: () => void;
}

interface SsrRenderState {
  output: string;
  scheduler: Scheduler;
  cleanup: () => void;
}

function runCsrComponent<TProps>(
  component: CsrRenderComponent<TProps>,
  props: TProps,
  document: Document,
  options: RenderOptions | undefined
): CsrRenderState {
  const scheduler = options?.scheduler ?? new Scheduler(noopSchedule, noopSchedule);
  const qContainer = options?.qContainer ?? createCaptureContainer(options?.captures ?? {});
  const rootOwner = createOwner();
  const invokeContext = newInvokeContext({
    owner: rootOwner,
    container: qContainer,
  });
  const ctx: RenderContext<'csr'> = {
    document,
    scheduler,
    mode: 'csr',
    qContainer,
  };

  let output: readonly Node[];
  try {
    output = createComponent(props, (componentProps) => component(componentProps, ctx), {
      container: qContainer,
      invokeContext,
    });
  } catch (error) {
    disposeOwner(rootOwner);
    throw error;
  }

  return {
    output,
    scheduler,
    cleanup() {
      disposeOwner(rootOwner);
    },
  };
}

function runSsrComponent<TProps>(
  component: SsrRenderComponent<TProps>,
  props: TProps,
  document: Document,
  options: RenderOptions | undefined
): SsrRenderState {
  const scheduler = options?.scheduler ?? new Scheduler(noopSchedule, noopSchedule);
  const qContainer = options?.qContainer ?? createCaptureContainer(options?.captures ?? {});
  const rootOwner = createOwner();
  const invokeContext = newInvokeContext({
    owner: rootOwner,
    container: qContainer,
  });
  const ctx: RenderContext<'ssr'> = {
    document,
    scheduler,
    mode: 'ssr',
    qContainer,
    textExpression: ssrTextExpression,
  };

  let output: string;
  try {
    output = createComponent(props, (componentProps) => component(componentProps, ctx), {
      container: qContainer,
      invokeContext,
    });
  } catch (error) {
    disposeOwner(rootOwner);
    throw error;
  }

  return {
    output,
    scheduler,
    cleanup() {
      disposeOwner(rootOwner);
    },
  };
}

function createRenderResult(
  document: Document,
  container: HTMLElement,
  nodes: readonly Node[],
  scheduler: Scheduler,
  cleanup: () => void
): RenderResult {
  return {
    document,
    container,
    html: container.innerHTML,
    nodes,
    scheduler,
    flush: () => flushScheduler(scheduler),
    cleanup,
  };
}

function createRenderCleanup(dispose: () => void, container: HTMLElement): () => void {
  let cleaned = false;
  return () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    dispose();
    while (container.firstChild !== null) {
      container.removeChild(container.firstChild);
    }
  };
}

async function flushScheduler(scheduler: Scheduler): Promise<void> {
  await scheduler.flushInteraction();
  await scheduler.flushDeferred();
}

function createContainerDocument(
  html: string,
  containerState: QContainerValue
): { document: Document; container: HTMLElement } {
  const document = createDocument({
    html: `<html><body><div ${QContainerAttr}="${containerState}">${html}</div></body></html>`,
  });
  const container = document.body.firstElementChild as HTMLElement | null;
  if (container === null) {
    throw new Error('Missing render container');
  }

  return { document, container };
}

function ssrTextExpression<TArgs extends unknown[]>(
  args: TArgs,
  fn: TextExpressionFn<TArgs>
): string {
  return stringifySsrTextExpressionValue(fn(...args));
}

function stringifySsrTextExpressionValue(value: TextExpressionValue): string {
  return escapeHTML(String(value));
}

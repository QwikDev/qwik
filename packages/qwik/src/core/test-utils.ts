import type { RenderRoot } from '@qwik.dev/core';
import {
  Scheduler,
  _renderCompiled as renderCsr,
  getPlatform,
  setPlatform,
  type ContainerContext,
} from '@qwik.dev/core/internal';
import type {
  _SsrRenderRoot as SsrRenderRoot,
  QwikLoaderOptions,
  RenderToStringOptions,
} from '@qwik.dev/core/server';
import { createDocument } from '../testing/document';
import { getTestPlatform } from '../testing/platform';
import {
  getTestModuleImporter,
  getTestTarget,
  hasCompiledTestTarget,
  renderSsrToDom,
} from '../testing/resume-session';
import type { CsrRenderRoot } from './csr-render';
import type { BranchRange } from './dom/branch/branch';
import { createTextExpressionEffect } from './dom/effect/text-effect';
import { SubscriberFlags } from './reactive/flags';
import { runWithCollector } from './reactive/tracking';
import {
  createOwner,
  getActiveOwner,
  registerSubscriberToOwner,
  runWithOwner,
  type Owner,
} from './runtime/owner';
import { invoke, newInvokeContext } from './runtime/invoke-context';
import { defaultScheduler } from './runtime/scheduler';
import {
  SubscriberKind,
  type DomSubscriber,
  type IdleSubscriber,
  type TaskSubscriber,
} from './runtime/subscriber';
import { useTask } from './runtime/task';
import { bootQwikLoader, type QwikLoaderTestDriver } from './qwikloader-test-driver';

export { bootQwikLoader };
export type { QwikLoaderEventPayload, QwikLoaderTestDriver } from './qwikloader-test-driver';

export const noopSchedule = (): void => {};

/** @public */
export interface RenderOptions<Props = undefined> {
  props?: Props;
  debug?: boolean;
  qwikLoader?: QwikLoaderOptions;
  scheduler?: Scheduler;
  base?: string;
  locale?: RenderToStringOptions<Props>['locale'];
  serverData?: Record<string, unknown>;
}

/** @public */
export interface RenderResult {
  document: Document;
  container: HTMLElement;
  html: string;
  nodes: readonly Node[];
  scheduler: Scheduler;
  qwikLoader?: QwikLoaderTestDriver;
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
    } as unknown as BranchRange,
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
  createDocumentFragment(): DocumentFragment {
    return createTestDocumentFragment();
  },
  createComment(data: string): Comment {
    return Object.assign(createTestDomNode(data), {
      data,
      nodeType: 8,
    }) as unknown as Comment;
  },
  createRange(): Range {
    return createTestRange();
  },
} as Document;

function createTestDocumentFragment(): TestDocumentFragment {
  const fragment = {
    isTestFragment: true,
    nodes: [] as TestDomNode[],
    get childNodes() {
      return fragment.nodes as unknown as NodeListOf<ChildNode>;
    },
    appendChild(node: Node): Node {
      return fragment.insertBefore(node, null);
    },
    removeChild(node: Node): Node {
      const child = node as TestDomNode;
      const index = fragment.nodes.indexOf(child);
      if (index === -1) {
        throw new Error('Missing child');
      }

      fragment.nodes.splice(index, 1);
      child.parent = null;
      return node;
    },
    insertBefore(node: Node, before: Node | null): Node {
      if (isTestDocumentFragment(node)) {
        while (node.nodes.length > 0) {
          fragment.insertBefore(node.nodes[0], before);
        }
        return node;
      }

      const child = node as TestDomNode;
      const beforeIndex =
        before === null ? fragment.nodes.length : fragment.nodes.indexOf(before as TestDomNode);
      if (beforeIndex === -1) {
        throw new Error('Missing reference child');
      }

      const currentParent = child.parent;
      if (currentParent !== null) {
        currentParent.removeChild(child);
      }

      fragment.nodes.splice(beforeIndex, 0, child);
      child.parent = fragment as unknown as TestParentNode;
      return node;
    },
  } as unknown as TestDocumentFragment;

  return fragment;
}

function isTestDocumentFragment(node: Node): node is TestDocumentFragment {
  return (node as Partial<TestDocumentFragment>).isTestFragment === true;
}

function createTestRange(): Range {
  let startContainer: TestParentNode | TestDocumentFragment | null = null;
  let startOffset = 0;
  let endContainer: TestParentNode | TestDocumentFragment | null = null;
  let endOffset = 0;

  const getParent = (node: Node): TestParentNode | TestDocumentFragment => {
    const parent = (node as TestDomNode).parent;
    if (parent === null) {
      throw new Error('Range boundary node must have a parent');
    }
    return parent as TestParentNode | TestDocumentFragment;
  };

  const getIndex = (parent: TestParentNode | TestDocumentFragment, node: Node): number => {
    const index = parent.nodes.indexOf(node as TestDomNode);
    if (index === -1) {
      throw new Error('Range boundary node not found');
    }
    return index;
  };

  return {
    get startContainer(): Node {
      return startContainer as unknown as Node;
    },
    get startOffset(): number {
      return startOffset;
    },
    get endContainer(): Node {
      return endContainer as unknown as Node;
    },
    get endOffset(): number {
      return endOffset;
    },
    setStartBefore(node: Node): void {
      startContainer = getParent(node);
      startOffset = getIndex(startContainer, node);
    },
    setStartAfter(node: Node): void {
      startContainer = getParent(node);
      startOffset = getIndex(startContainer, node) + 1;
    },
    setEndAfter(node: Node): void {
      endContainer = getParent(node);
      endOffset = getIndex(endContainer, node) + 1;
    },
    setEndBefore(node: Node): void {
      endContainer = getParent(node);
      endOffset = getIndex(endContainer, node);
    },
    deleteContents(): void {
      if (startContainer === null || endContainer === null || startContainer !== endContainer) {
        throw new Error('Range boundary not set');
      }

      while (startOffset < endOffset) {
        const child = startContainer.nodes[startOffset];
        startContainer.removeChild(child);
        endOffset--;
      }
    },
    insertNode(node: Node): void {
      if (startContainer === null) {
        throw new Error('Range boundary not set');
      }
      startContainer.insertBefore(node, startContainer.nodes[startOffset] ?? null);
    },
  } as unknown as Range;
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
    get childNodes() {
      return parent.nodes as unknown as NodeListOf<ChildNode>;
    },
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
        while (node.nodes.length > 0) {
          parent.insertBefore(node.nodes[0], before);
        }
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
      get className() {
        return attrs.get('class') ?? '';
      },
      set className(value: string) {
        if (value === '') {
          attrs.delete('class');
        } else {
          attrs.set('class', value);
        }
      },
      setAttribute(name: string, value: string) {
        if (name === 'class' && value === '') {
          attrs.delete(name);
        } else {
          attrs.set(name, value);
        }
      },
      removeAttribute(name: string) {
        attrs.delete(name);
      },
    } as Element,
    attrs,
  };
}

export function createCaptureContainer(
  captures: Record<string, unknown>,
  scheduler = new Scheduler(noopSchedule)
): ContainerContext & { nextId(): number } {
  let nextId = 0;
  const container: ContainerContext & { nextId(): number } = {
    element: {} as HTMLElement,
    document: null!,
    locale: null,
    scheduler,
    state: {
      rootToChunk: [],
      forwardRefsChunk: null,
      liveRoots: new Map(),
    },
    forwardRefs: null,
    getForwardRefs() {
      return container.forwardRefs;
    },
    getRoot(id) {
      return Promise.resolve(captures[String(id)]);
    },
    async restoreCaptures(ids) {
      const normalized = ids.trim();
      if (normalized.length === 0) {
        return [];
      }
      const parts = normalized.split(' ');
      const results: unknown[] = new Array(parts.length);
      for (let i = 0; i < parts.length; i++) {
        results[i] = await container.getRoot(parts[i]);
      }
      return results;
    },
    nextId() {
      return nextId++;
    },
  };
  return container;
}

export function runWithTestContainer<T>(
  scheduler: Scheduler,
  run: () => T,
  owner: Owner | null = createOwner(null)
): T {
  return runWithCollector(
    null,
    invoke,
    newInvokeContext({ owner, container: createCaptureContainer({}, scheduler) }),
    run
  );
}

export function useTaskSubscriber(
  scheduler: Scheduler,
  label: string,
  order: string[]
): TaskSubscriber {
  const create = () => useTask(() => order.push(label));
  return runWithTestContainer(scheduler, create, getActiveOwner() ?? createOwner(null));
}

export function createOrderTextExpressionEffect(
  scheduler: Scheduler,
  label: string,
  order: string[]
): DomSubscriber {
  const create = () =>
    createTextExpressionEffect(
      createText(),
      [],
      () => {
        order.push(label);
        return label;
      },
      scheduler
    );
  return getActiveOwner() === null ? runWithOwner(createOwner(null), create) : create();
}

export function createIdleSubscriber(notify: () => void, scheduler?: Scheduler): IdleSubscriber {
  const subscriber: IdleSubscriber = {
    kind: SubscriberKind.Idle,
    owner: null,
    job: {
      run: notify,
    },
    flags: SubscriberFlags.None,
    scheduler: scheduler ?? defaultScheduler,
  };
  return registerSubscriberToOwner(subscriber, createOwner(null));
}

export type CsrRenderComponent<Props = undefined> = CsrRenderRoot<Props>;
export type SsrRenderComponent<Props = undefined> = SsrRenderRoot<Props>;

/** @public */
export async function csrRender<Props>(
  root: RenderRoot<Props>,
  options?: RenderOptions<Props>
): Promise<RenderResult> {
  if (!hasCompiledTestTarget()) {
    throw new Error("csrRender requires qwikVite({ testTarget: 'csr' }).");
  }
  assertTestTarget('csr');
  const document = createDocument();
  const container = document.createElement('div');
  document.body.appendChild(container);
  return csrRenderInto(root, document, container, options);
}

/** @internal */
export async function csrRenderInto<Props>(
  root: RenderRoot<Props>,
  document: Document,
  container: HTMLElement,
  options?: RenderOptions<Props>
): Promise<RenderResult> {
  assertTestTarget('csr');
  const previousPlatform = getPlatform();
  setPlatform(getTestPlatform());
  const scheduler = options?.scheduler ?? new Scheduler(noopSchedule);
  let renderResult: Awaited<ReturnType<typeof renderCsr>> | undefined;
  let qwikLoader: QwikLoaderTestDriver | undefined;

  try {
    renderResult = await renderCsr(container, root as CsrRenderRoot<Props>, {
      scheduler,
      props: options?.props,
      serverData: options?.serverData,
    });
    qwikLoader = shouldBootQwikLoaderFromEvents(document)
      ? withSchedulerFlush(await bootQwikLoader(document, getTestModuleImporter()), scheduler)
      : undefined;
    const nodes = Array.from(container.childNodes);
    const cleanup = createRenderCleanup(() => {
      qwikLoader?.cleanup();
      renderResult?.cleanup();
      setPlatform(previousPlatform);
    }, container);
    const result = createRenderResult(document, container, nodes, scheduler, cleanup);
    await result.flush();
    if (options?.debug) {
      // eslint-disable-next-line no-console
      console.log(`\n-------------------- CSR HTML --------------------\n${container.innerHTML}`);
    }
    return { ...result, html: container.innerHTML, qwikLoader };
  } catch (error) {
    qwikLoader?.cleanup();
    renderResult?.cleanup();
    setPlatform(previousPlatform);
    throw error;
  }
}

/** @public */
export async function ssrRender<Props>(
  root: RenderRoot<Props>,
  options?: RenderOptions<Props>
): Promise<RenderResult> {
  if (!hasCompiledTestTarget()) {
    throw new Error("ssrRender requires qwikVite({ testTarget: 'resume' | 'ssr' }).");
  }
  const target = getTestTarget();
  if (target === 'csr') {
    throw new Error('ssrRender requires a resume or ssr test target.');
  }
  return renderSsrToDom(root, options, target === 'resume');
}

export const testRenderer =
  getTestTarget() === 'csr'
    ? { name: 'csrRender', render: csrRender }
    : { name: 'ssrRender', render: ssrRender };

function assertTestTarget(expected: 'csr'): void {
  const actual = getTestTarget();
  if (actual !== expected) {
    throw new Error(`csrRender requires the ${expected} test target, received ${actual}.`);
  }
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
    flush: () => scheduler.flushInteraction(),
    cleanup,
  };
}

function createRenderCleanup(dispose: () => void, container: HTMLElement): () => void {
  let isCleaned = false;
  return () => {
    if (isCleaned) {
      return;
    }
    isCleaned = true;
    dispose();
    while (container.firstChild !== null) {
      container.removeChild(container.firstChild);
    }
  };
}

function withSchedulerFlush(
  qwikLoader: QwikLoaderTestDriver,
  scheduler: Scheduler
): QwikLoaderTestDriver {
  return {
    async dispatch(target, type, payload) {
      const event = await qwikLoader.dispatch(target, type, payload);
      await scheduler.flushInteraction();
      return event;
    },
    cleanup: () => qwikLoader.cleanup(),
  };
}

function shouldBootQwikLoaderFromEvents(document: Document): boolean {
  const qWindow = document.defaultView as (Window & { _qwikEv?: unknown }) | null;
  if (Array.isArray(qWindow?._qwikEv) && qWindow._qwikEv.length > 0) {
    return true;
  }
  const elements = document.querySelectorAll('*');
  for (let i = 0; i < elements.length; i++) {
    if ((elements[i] as { _qDispatch?: unknown })._qDispatch) {
      return true;
    }
  }
  return false;
}

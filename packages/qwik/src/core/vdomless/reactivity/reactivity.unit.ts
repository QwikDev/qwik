import { describe, expect, it } from 'vitest';
import { _captures, createQRL } from '../../shared/qrl/qrl-class';
import type { Container } from '../../shared/types';
import {
  BranchState,
  createBranch,
  createBranchQrl,
  createBranchQrlSubscriber,
  createBranchRange as createMarkerBranchRange,
  type BranchConditionFn,
  type BranchRange,
  type BranchRenderFn,
} from './branch';
import { createComponent, type ComponentRenderFn } from './component';
import { disposeSubscriber } from './cleanup';
import { Computed, createComputed } from './computed';
import { createComputedQrl } from './computed-qrl';
import {
  createAttrEffect,
  createClassEffect,
  createStyleEffect,
  createTextExpressionEffect,
  createTextExpressionEffectQrl,
  createTextNodeEffect,
  type TextExpressionFn,
} from './dom-effect';
import { ReactiveFlags } from './flags';
import {
  createOwner,
  disposeOwner,
  getActiveOwner,
  registerSubscriberToOwner,
  runWithOwner,
  type Owner,
} from './owner';
import {
  createChildRenderContext,
  getActiveRenderContext,
  getActiveRenderContextOrNull,
  runWithRenderContext,
  type ContextScope,
  type RenderContext,
  type SlotScope,
} from './render-context';
import { Phase, Scheduler } from './scheduler';
import { createSignal } from './signal';
import {
  SubscriberKind,
  type BranchSubscriber,
  type DomSubscriber,
  type IdleSubscriber,
  type TaskSubscriber,
  type VisibleTaskSubscriber,
} from './subscriber';
import {
  createTask,
  createTaskGroup,
  createTaskQrl,
  createVisibleTask,
  createVisibleTaskQrl,
  type TaskFn,
} from './task';
import { getActiveCollector, runWithCollector } from './tracking';

const noopSchedule = (): void => {};

function createText(data = ''): Text {
  return { data } as Text;
}

function createNode(label: string): Node {
  return { label } as unknown as Node;
}

function getNodeLabel(node: Node): string {
  return (node as unknown as { label: string }).label;
}

function createBranchRange(): { range: BranchRange; replacements: Node[][] } {
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

interface TestParentNode extends Node {
  nodes: TestDomNode[];
}

interface TestDomNode extends Node {
  label: string;
  parent: TestParentNode | null;
}

interface TestDocumentFragment extends DocumentFragment {
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

function createTestDomNode(label: string): TestDomNode {
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

function createTestParentNode(nodes: TestDomNode[]): TestParentNode {
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

function createAttrTarget(): { element: Element; attrs: Map<string, string> } {
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

function createCaptureContainer(captures: Record<string, unknown>): Container {
  return {
    $getObjectById$: (id: number | string) => captures[String(id)],
  } as Container;
}

describe('vdomless reactivity', () => {
  it('notifies signal subscribers and skips Object.is-equal writes', () => {
    const count = createSignal(0);
    let notifications = 0;
    const subscriber = createIdleSubscriber(() => {
      notifications++;
    });

    count.subs = [subscriber];
    count.value = 0;

    expect(notifications).toBe(0);
    expect(count.version).toBe(0);

    count.value = 1;

    expect(notifications).toBe(1);
    expect(count.version).toBe(1);
  });

  it('keeps computed values lazy and cached until a dependency changes', () => {
    const count = createSignal(1);
    let runs = 0;
    const doubled = createComputed(() => {
      runs++;
      return count.value * 2;
    });

    expect(runs).toBe(0);
    expect(doubled.value).toBe(2);
    expect(runs).toBe(1);

    expect(doubled.value).toBe(2);
    expect(runs).toBe(1);

    count.value = 2;

    expect(runs).toBe(1);
    expect(doubled.value).toBe(4);
    expect(runs).toBe(2);
    expect(doubled.version).toBe(2);
  });

  it('propagates computed dirty state through computed chains lazily', () => {
    const count = createSignal(1);
    let doubledRuns = 0;
    let quadrupledRuns = 0;
    const doubled = createComputed(() => {
      doubledRuns++;
      return count.value * 2;
    });
    const quadrupled = createComputed(() => {
      quadrupledRuns++;
      return doubled.value * 2;
    });

    expect(quadrupled.value).toBe(4);
    expect(doubledRuns).toBe(1);
    expect(quadrupledRuns).toBe(1);

    count.value = 2;

    expect(doubledRuns).toBe(1);
    expect(quadrupledRuns).toBe(1);
    expect(quadrupled.value).toBe(8);
    expect(doubledRuns).toBe(2);
    expect(quadrupledRuns).toBe(2);
  });

  it('drops stale dynamic computed dependencies on recompute', () => {
    const useA = createSignal(true);
    const a = createSignal('a');
    const b = createSignal('b');
    let runs = 0;
    const selected = createComputed(() => {
      runs++;
      return useA.value ? a.value : b.value;
    });

    expect(selected.value).toBe('a');
    expect(runs).toBe(1);

    useA.value = false;
    expect(selected.value).toBe('b');
    expect(runs).toBe(2);
    expect(a.subs).toBeNull();

    a.value = 'next-a';
    expect(selected.value).toBe('b');
    expect(runs).toBe(2);

    b.value = 'next-b';
    expect(selected.value).toBe('next-b');
    expect(runs).toBe(3);
  });

  it('removes source subscriptions when a collector is disposed', () => {
    const count = createSignal(1);
    const doubled = createComputed(() => count.value * 2);

    expect(doubled.value).toBe(2);
    expect(count.subs).toContain(doubled);

    disposeSubscriber(doubled);

    expect(count.subs).toBeNull();
  });

  it('reads cached disposed computed values without tracking', () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const count = createSignal(1);
    const collector = createTask(() => {}, { scheduler });
    let runs = 0;
    const doubled = createComputed(() => {
      runs++;
      return count.value * 2;
    });

    expect(doubled.value).toBe(2);
    expect(runs).toBe(1);

    disposeSubscriber(doubled);
    count.value = 2;

    runWithCollector(collector, () => {
      expect(doubled.value).toBe(2);
    });

    expect(runs).toBe(1);
    expect(count.subs).toBeNull();
    expect(doubled.subs).toBeNull();
    expect(collector.deps).toBeNull();
  });

  it('throws when reading a disposed computed without a cached value', () => {
    const doubled = createComputed(() => 2);

    disposeSubscriber(doubled);

    expect(() => doubled.value).toThrow('Cannot read disposed computed without cached value');
  });

  it('clears computed subscribers when disposed', () => {
    const count = createSignal(1);
    let runs = 0;
    const doubled = createComputed(() => {
      runs++;
      return count.value * 2;
    });
    const quadrupled = createComputed(() => doubled.value * 2);

    expect(quadrupled.value).toBe(4);
    expect(doubled.subs).toContain(quadrupled);

    disposeSubscriber(doubled);
    count.value = 2;

    expect(doubled.subs).toBeNull();
    expect(doubled.value).toBe(2);
    expect(runs).toBe(1);
  });

  it('throws on circular computed dependencies', () => {
    const circular: Computed<number> = createComputed(() => circular.value + 1);

    expect(() => circular.value).toThrow('Circular computed dependency');
  });

  it('runs resolved computed QRLs synchronously', () => {
    const computed = createComputedQrl(createQRL('chunk', 'symbol', () => 'computed', null, null));

    expect(computed.value).toBe('computed');
  });

  it('throws unresolved computed QRL promises and computes after resolve', async () => {
    const qrl = createQRL(
      'chunk',
      'symbol',
      null,
      () => Promise.resolve({ symbol: () => 'resolved-computed' }),
      null
    );
    const computed = createComputedQrl(qrl);
    let pending: unknown;

    try {
      computed.value;
    } catch (promise) {
      pending = promise;
    }

    expect(pending).toBeInstanceOf(Promise);
    await pending;
    expect(computed.value).toBe('resolved-computed');
  });

  it('restores serialized captures for computed QRLs', async () => {
    const container = createCaptureContainer({
      0: 'left',
      1: 'right',
    });
    const qrl = createQRL(
      'chunk',
      'symbol',
      null,
      () =>
        Promise.resolve({
          symbol: () => (_captures as readonly string[]).join(':'),
        }),
      '0 1',
      container
    );
    const computed = createComputedQrl(qrl, container);
    let pending: unknown;

    try {
      computed.value;
    } catch (promise) {
      pending = promise;
    }

    expect(pending).toBeInstanceOf(Promise);
    await pending;
    expect(computed.value).toBe('left:right');
  });

  it('flushes scheduled work in phase order', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    const task = createTaskSubscriber(scheduler, 'task', order);
    const structural = createOrderTextExpressionEffect(
      scheduler,
      Phase.StructuralDom,
      'structural',
      order
    );
    const scalar = createOrderTextExpressionEffect(scheduler, Phase.ScalarDom, 'scalar', order);

    scheduler.notify(scalar);
    scheduler.notify(structural);
    scheduler.notify(task);

    await scheduler.flushInteraction();

    expect(order).toEqual(['task', 'structural', 'scalar']);
  });

  it('sorts blocking tasks by group path and task index', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    const parent0 = createTaskSubscriber(scheduler, 'parent-0', order, [0], 0);
    const parent1 = createTaskSubscriber(scheduler, 'parent-1', order, [0], 1);
    const child0 = createTaskSubscriber(scheduler, 'child-0', order, [0, 0], 0);

    scheduler.notify(child0);
    scheduler.notify(parent1);
    scheduler.notify(parent0);

    await scheduler.flushInteraction();

    expect(order).toEqual(['parent-0', 'parent-1', 'child-0']);
  });

  it('keeps enqueue order for tasks with the same group path and index', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    const first = createTaskSubscriber(scheduler, 'first', order, [0], 0);
    const second = createTaskSubscriber(scheduler, 'second', order, [0], 0);

    scheduler.notify(first);
    scheduler.notify(second);

    await scheduler.flushInteraction();

    expect(order).toEqual(['first', 'second']);
  });

  it('dedupes scheduled subscribers in one batch', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    const scalar = createOrderTextExpressionEffect(scheduler, Phase.ScalarDom, 'scalar', order);

    scheduler.notify(scalar);
    scheduler.notify(scalar);

    await scheduler.flushInteraction();

    expect(order).toEqual(['scalar']);
  });

  it('patches text expression data', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const count = createSignal(7);
    const text = createText();
    const effect = createTextExpressionEffect(text, [count], (source) => source.value, {
      scheduler,
    });

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('7');
  });

  it('tracks dependencies for text expression DOM subscribers', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const count = createSignal(0);
    const seen: number[] = [];
    const text = createText();
    const scalar = createTextExpressionEffect(
      text,
      [count],
      (source) => {
        const value = source.value;
        seen.push(value);
        return value;
      },
      { scheduler }
    );

    expect(seen).toEqual([]);
    scheduler.notify(scalar);
    await scheduler.flushInteraction();

    expect(seen).toEqual([0]);
    expect(count.subs).toContain(scalar);
    expect(text.data).toBe('0');

    count.value = 1;
    await scheduler.flushInteraction();

    expect(seen).toEqual([0, 1]);
    expect(text.data).toBe('1');
  });

  it('patches text nodes from direct sources', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const count = createSignal(7);
    const text = createText();
    const effect = createTextNodeEffect(text, count, { scheduler });

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('7');
    expect(count.subs).toContain(effect);

    count.value = 8;
    await scheduler.flushInteraction();

    expect(text.data).toBe('8');
  });

  it('patches attributes from direct sources', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const title = createSignal('hello');
    const { element, attrs } = createAttrTarget();
    const effect = createAttrEffect(element, 'title', title, { scheduler });

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(attrs.get('title')).toBe('hello');

    title.value = 'world';
    await scheduler.flushInteraction();

    expect(attrs.get('title')).toBe('world');
  });

  it('patches serialized styles from direct sources', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const style = createSignal({
      opacity: 0.5,
      display: 'grid',
    });
    const { element, attrs } = createAttrTarget();
    const effect = createStyleEffect(element, style, { scheduler });

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(attrs.get('style')).toBe('opacity:0.5;display:grid');

    style.value = {
      opacity: 1,
      display: 'block',
    };
    await scheduler.flushInteraction();

    expect(attrs.get('style')).toBe('opacity:1;display:block');
  });

  it('patches serialized classes from direct sources', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const classes = createSignal<unknown>({
      active: true,
      hidden: false,
      selected: 1,
    });
    const { element, attrs } = createAttrTarget();
    const effect = createClassEffect(element, classes, { scheduler });

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(attrs.get('class')).toBe('active selected');

    classes.value = ['base', { active: false, next: true }];
    await scheduler.flushInteraction();

    expect(attrs.get('class')).toBe('base next');
  });

  it('patches direct DOM effects from computed sources', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const count = createSignal(2);
    const doubled = createComputed(() => count.value * 2);
    const text = createText();
    const effect = createTextNodeEffect(text, doubled, { scheduler });

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('4');
    expect(doubled.subs).toContain(effect);

    count.value = 3;
    await scheduler.flushInteraction();

    expect(text.data).toBe('6');
  });

  it('sorts DOM effects by order and keeps enqueue order for ties', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    const firstTie = createOrderTextExpressionEffect(
      scheduler,
      Phase.ScalarDom,
      'first-tie',
      order,
      0
    );
    const nextOrder = createOrderTextExpressionEffect(
      scheduler,
      Phase.ScalarDom,
      'next-order',
      order,
      1
    );
    const secondTie = createOrderTextExpressionEffect(
      scheduler,
      Phase.ScalarDom,
      'second-tie',
      order,
      0
    );

    scheduler.notify(nextOrder);
    scheduler.notify(firstTie);
    scheduler.notify(secondTie);
    await scheduler.flushInteraction();

    expect(order).toEqual(['first-tie', 'second-tie', 'next-order']);
  });

  it('sorts mixed DOM effects by order and keeps enqueue order for ties', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order = createSignal('');
    const first = createAttrEffect(createAttrTarget().element, 'data-order', order, {
      scheduler,
      order: 0,
    });
    const second = createStyleEffect(createAttrTarget().element, order, {
      scheduler,
      order: 0,
    });
    const third = createTextNodeEffect(createText(), order, { scheduler, order: 1 });
    const seen: string[] = [];

    first.effect.run = () => {
      seen.push('first');
    };
    second.effect.run = () => {
      seen.push('second');
    };
    third.effect.run = () => {
      seen.push('third');
    };

    scheduler.notify(third);
    scheduler.notify(first);
    scheduler.notify(second);
    await scheduler.flushInteraction();

    expect(seen).toEqual(['first', 'second', 'third']);
  });

  it('removes direct DOM effects from sources when disposed', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const count = createSignal(1);
    const effect = createTextNodeEffect(createText(), count, { scheduler });

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(count.subs).toContain(effect);

    disposeSubscriber(effect);

    expect(count.subs).toBeNull();
  });

  it('creates branch ranges from comment markers', () => {
    const start = createTestDomNode('start');
    const oldA = createTestDomNode('old-a');
    const oldB = createTestDomNode('old-b');
    const end = createTestDomNode('end');
    const nextA = createTestDomNode('next-a');
    const nextB = createTestDomNode('next-b');
    const parent = createTestParentNode([start, oldA, oldB, end]);
    const range = createMarkerBranchRange(start as unknown as Comment, end as unknown as Comment);

    range.replace([nextA, nextB]);

    expect(parent.nodes.map(getNodeLabel)).toEqual(['start', 'next-a', 'next-b', 'end']);
    expect(oldA.parentNode).toBeNull();
    expect(oldB.parentNode).toBeNull();
    expect(start.parentNode).toBe(parent);
    expect(end.parentNode).toBe(parent);

    range.replace([]);

    expect(parent.nodes.map(getNodeLabel)).toEqual(['start', 'end']);
    expect(nextA.parentNode).toBeNull();
    expect(nextB.parentNode).toBeNull();
  });

  it('mounts components without collecting direct signal reads', () => {
    const count = createSignal(1);
    const node = createNode('component');

    const nodes = createComponent(count, (source) => {
      expect(getActiveCollector()).toBeNull();
      source.value;
      return [node];
    });

    expect(nodes).toEqual([node]);
    expect(count.subs).toBeNull();
  });

  it('does not collect direct component reads from an outer collector', () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const collector = createTask(() => {}, { scheduler });
    const count = createSignal(1);
    const node = createNode('component');

    runWithCollector(collector, () => {
      const nodes = createComponent(count, (source) => {
        source.value;
        return [node];
      });

      expect(nodes).toEqual([node]);
    });

    expect(count.subs).toBeNull();
    expect(collector.deps).toBeNull();
  });

  it('registers component render work with the active owner', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const owner = createOwner();
    const source = createSignal('mounted');
    const text = createText();
    const node = createNode('component');
    let nodes!: readonly Node[];

    runWithOwner(owner, () => {
      nodes = createComponent({ source, text }, (props) => {
        const effect = createTextNodeEffect(props.text, props.source, { scheduler });
        scheduler.notify(effect);
        return [node];
      });
    });
    await scheduler.flushInteraction();

    expect(nodes).toEqual([node]);
    expect(text.data).toBe('mounted');
    expect(owner.subscribers).not.toBeNull();
    expect(source.subs).not.toBeNull();

    disposeOwner(owner);

    expect(source.subs).toBeNull();
  });

  it('rejects async component renderers', () => {
    const render = (() => Promise.resolve([])) as unknown as ComponentRenderFn<null>;

    expect(() => createComponent(null, render)).toThrow('Component renderer must be synchronous');
  });

  it('returns component strings for server renderers', () => {
    const html = createComponent({ name: 'Qwik' }, (props) => `<span>${props.name}</span>`);

    expect(html).toBe('<span>Qwik</span>');
  });

  it('disposes component work when render throws', () => {
    const source = createSignal('value');
    const text = createText();
    const owner = createOwner();
    let effect!: DomSubscriber;

    expect(() => {
      runWithOwner(owner, () => {
        createComponent(null, () => {
          effect = createTextNodeEffect(text, source);
          throw new Error('render failed');
        });
      });
    }).toThrow('render failed');

    expect(effect.flags).toBe(ReactiveFlags.None);

    disposeOwner(owner);

    expect(effect.flags).toBe(ReactiveFlags.Disposed);
  });

  it('creates child render contexts for component renderers', () => {
    const contextScope: ContextScope = {
      id: 'context',
      parent: null,
      values: new Map(),
    };
    const parentContext: RenderContext = {
      parent: null,
      idPrefix: 'parent-',
      contextScope,
      localContextScope: null,
      slotScope: null,
    };
    const slotScope: SlotScope = {
      id: 'slot',
      slots: new Map(),
    };
    let activeContext!: RenderContext;

    const nodes = runWithRenderContext(parentContext, () =>
      createComponent(
        null,
        () => {
          activeContext = getActiveRenderContext();
        },
        {
          idPrefix: 'child-',
          slotScope,
        }
      )
    );

    expect(nodes).toEqual([]);
    expect(activeContext.parent).toBe(parentContext);
    expect(activeContext.idPrefix).toBe('child-');
    expect(activeContext.contextScope).toBe(contextScope);
    expect(activeContext.localContextScope).toBeNull();
    expect(activeContext.slotScope).toBe(slotScope);
  });

  it('restores render context after throw', () => {
    const outerContext = createChildRenderContext(null, { idPrefix: 'outer-' });
    const innerContext = createChildRenderContext(outerContext, { idPrefix: 'inner-' });

    runWithRenderContext(outerContext, () => {
      expect(getActiveRenderContext()).toBe(outerContext);

      expect(() => {
        runWithRenderContext(innerContext, () => {
          expect(getActiveRenderContext()).toBe(innerContext);
          throw new Error('boom');
        });
      }).toThrow('boom');

      expect(getActiveRenderContext()).toBe(outerContext);
    });

    expect(getActiveRenderContextOrNull()).toBeNull();
  });

  it('restores branch render contexts before creating components', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const branchContext = createChildRenderContext(null, { idPrefix: 'branch-' });
    const visible = createSignal(true);
    const branchNode = createNode('branch');
    const componentNode = createNode('component');
    const { range, replacements } = createBranchRange();
    let conditionContext: RenderContext | null = null;
    let componentContext!: RenderContext;

    const branch = runWithRenderContext(branchContext, () =>
      createBranch<[typeof visible]>(
        range,
        [visible],
        (source) => {
          conditionContext = getActiveRenderContextOrNull();
          return source.value;
        },
        () => {
          const nodes = createComponent(null, () => {
            componentContext = getActiveRenderContext();
            return [componentNode];
          });
          return nodes.length === 0 ? [branchNode] : nodes;
        },
        undefined,
        { scheduler }
      )
    );

    scheduler.notify(branch);
    await scheduler.flushInteraction();

    expect(conditionContext).toBe(branchContext);
    expect(componentContext.parent).toBe(branchContext);
    expect(componentContext.idPrefix).toBe('branch-');
    expect(replacements).toEqual([[componentNode]]);
  });

  it('runs CSR branches and switches branch owners', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const visible = createSignal(true);
    const branchText = createSignal('then');
    const { range, replacements } = createBranchRange();
    const thenNode = createNode('then');
    const elseNode = createNode('else');
    const text = createText();
    let thenRuns = 0;
    let elseRuns = 0;

    const branch = createBranch<[typeof visible, typeof branchText, Text]>(
      range,
      [visible, branchText, text],
      (source) => source.value,
      (_source, textSource, target) => {
        thenRuns++;
        const effect = createTextNodeEffect(target, textSource, { scheduler });
        scheduler.notify(effect);
        return [thenNode];
      },
      () => {
        elseRuns++;
        return [elseNode];
      },
      { scheduler }
    ) as BranchSubscriber;

    scheduler.notify(branch);
    await scheduler.flushInteraction();

    expect(replacements).toEqual([[thenNode]]);
    expect(text.data).toBe('then');
    expect(visible.subs).toContain(branch);
    expect(branchText.subs).not.toBeNull();
    expect(branch.branch.currentOwner).not.toBeNull();
    expect(thenRuns).toBe(1);
    expect(elseRuns).toBe(0);

    branchText.value = 'next';
    await scheduler.flushInteraction();

    expect(text.data).toBe('next');

    visible.value = false;
    await scheduler.flushInteraction();

    expect(replacements).toEqual([[thenNode], [elseNode]]);
    expect(branchText.subs).toBeNull();
    expect(thenRuns).toBe(1);
    expect(elseRuns).toBe(1);

    visible.value = true;
    await scheduler.flushInteraction();

    expect(replacements).toEqual([[thenNode], [elseNode], [thenNode]]);
    expect(thenRuns).toBe(2);
    expect(elseRuns).toBe(1);
  });

  it('does not rerender CSR branches when branch state is unchanged', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const count = createSignal(1);
    const { range, replacements } = createBranchRange();
    const node = createNode('positive');
    let renderRuns = 0;
    const branch = createBranch<[typeof count]>(
      range,
      [count],
      (source) => source.value > 0,
      () => {
        renderRuns++;
        return [node];
      },
      undefined,
      { scheduler }
    );

    scheduler.notify(branch);
    await scheduler.flushInteraction();

    count.value = 2;
    await scheduler.flushInteraction();

    expect(replacements).toEqual([[node]]);
    expect(renderRuns).toBe(1);
  });

  it('sorts structural branches with structural DOM effects by order', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    const { range } = createBranchRange();
    const branch = createBranch<[]>(
      range,
      [],
      () => true,
      () => {
        order.push('branch');
      },
      undefined,
      { scheduler, order: 0 }
    );
    const effect = createTextExpressionEffect(
      createText(),
      [],
      () => {
        order.push('effect');
        return 'effect';
      },
      { scheduler, phase: Phase.StructuralDom, order: 1 }
    );

    scheduler.notify(effect);
    scheduler.notify(branch);
    await scheduler.flushInteraction();

    expect(order).toEqual(['branch', 'effect']);
  });

  it('skips disposed tasks that were already scheduled', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const seen: string[] = [];
    const task = createTask(() => seen.push('task'), { scheduler });

    scheduler.notify(task);
    disposeSubscriber(task);
    scheduler.notify(task);
    await scheduler.flushInteraction();

    expect(seen).toEqual([]);
    expect(task.flags).toBe(ReactiveFlags.Disposed);
  });

  it('skips disposed DOM effects that were already scheduled', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const text = createText();
    const effect = createTextNodeEffect(text, createSignal('next'), { scheduler });

    scheduler.notify(effect);
    disposeSubscriber(effect);
    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('');
    expect(effect.flags).toBe(ReactiveFlags.Disposed);
  });

  it('skips disposed branches that were already scheduled', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const { range, replacements } = createBranchRange();
    let runs = 0;
    const branch = createBranch<[]>(
      range,
      [],
      () => true,
      () => {
        runs++;
      },
      undefined,
      { scheduler }
    );

    scheduler.notify(branch);
    disposeSubscriber(branch);
    scheduler.notify(branch);
    await scheduler.flushInteraction();

    expect(runs).toBe(0);
    expect(replacements).toEqual([[]]);
    expect(branch.flags).toBe(ReactiveFlags.Disposed);
  });

  it('disposes active branch owners and clears branch ranges', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const visible = createSignal(true);
    const local = createSignal('local');
    const text = createText();
    const node = createNode('branch');
    const { range, replacements } = createBranchRange();
    const branch = createBranch<[typeof visible, typeof local, Text]>(
      range,
      [visible, local, text],
      (source) => source.value,
      (_source, localSource, target) => {
        const effect = createTextNodeEffect(target, localSource, { scheduler });
        scheduler.notify(effect);
        return [node];
      },
      undefined,
      { scheduler }
    ) as BranchSubscriber;

    scheduler.notify(branch);
    await scheduler.flushInteraction();

    expect(replacements).toEqual([[node]]);
    expect(visible.subs).toContain(branch);
    expect(local.subs).not.toBeNull();
    expect(branch.branch.currentOwner).not.toBeNull();

    disposeSubscriber(branch);

    expect(visible.subs).toBeNull();
    expect(local.subs).toBeNull();
    expect(branch.branch.currentOwner).toBeNull();
    expect(branch.branch.currentBranch).toBeNull();
    expect(replacements).toEqual([[node], []]);
  });

  it('registers subscribers with the active owner', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const owner = createOwner();
    const count = createSignal(1);
    const text = createText();
    let effect!: DomSubscriber;

    expect(getActiveOwner()).toBeNull();
    runWithOwner(owner, () => {
      expect(getActiveOwner()).toBe(owner);
      effect = createTextNodeEffect(text, count, { scheduler });
      expect(owner.subscribers).toEqual([effect]);
    });
    expect(getActiveOwner()).toBeNull();
    expect(owner.subscribers).toEqual([effect]);

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('1');
    expect(count.subs).toContain(effect);

    disposeOwner(owner);

    expect(owner.disposed).toBe(true);
    expect(owner.subscribers).toBeNull();
    expect(count.subs).toBeNull();
  });

  it('registers subscribers to an explicit owner without duplication', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const owner = createOwner();
    const count = createSignal(1);
    const effect = createTextNodeEffect(createText(), count, { scheduler });

    expect(owner.subscribers).toBeNull();
    registerSubscriberToOwner(effect, owner);
    registerSubscriberToOwner(effect, owner);
    expect(owner.subscribers).toEqual([effect]);

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(count.subs).toContain(effect);

    disposeOwner(owner);

    expect(count.subs).toBeNull();
  });

  it('leaves subscribers created without an active owner unowned', () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const owner = createOwner();
    const effect = createTextNodeEffect(createText(), createSignal(1), { scheduler });

    expect(owner.subscribers).toBeNull();

    disposeOwner(owner);

    expect(effect.flags & ReactiveFlags.Disposed).toBe(0);
  });

  it('detaches disposed child owners from their parent', () => {
    const parent = createOwner();
    let first!: Owner;
    let second!: Owner;

    runWithOwner(parent, () => {
      first = createOwner();
      second = createOwner();
    });

    expect(first.parent).toBe(parent);
    expect(second.parent).toBe(parent);
    expect(parent.childOwners).toHaveLength(2);

    disposeOwner(first);
    disposeOwner(first);

    expect(first.disposed).toBe(true);
    expect(first.parent).toBeNull();
    expect(parent.disposed).toBe(false);
    expect(second.disposed).toBe(false);
    expect(second.parent).toBe(parent);
    expect(parent.childOwners).toHaveLength(1);
    expect(parent.childOwners![0]).toBe(second);
  });

  it('disposes child owners with their parent owner', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const parent = createOwner();
    const outerSource = createSignal('outer');
    const innerSource = createSignal('inner');
    let child!: Owner;
    let outerEffect!: DomSubscriber;
    let innerEffect!: DomSubscriber;

    runWithOwner(parent, () => {
      outerEffect = createTextNodeEffect(createText(), outerSource, { scheduler });
      child = createOwner();
      runWithOwner(child, () => {
        innerEffect = createTextNodeEffect(createText(), innerSource, { scheduler });
      });
    });

    expect(parent.subscribers).toEqual([outerEffect]);
    expect(parent.childOwners).toHaveLength(1);
    expect(parent.childOwners![0]).toBe(child);
    expect(child.parent).toBe(parent);
    expect(child.subscribers).toEqual([innerEffect]);

    scheduler.notify(outerEffect);
    scheduler.notify(innerEffect);
    await scheduler.flushInteraction();

    expect(outerSource.subs).toContain(outerEffect);
    expect(innerSource.subs).toContain(innerEffect);

    disposeOwner(parent);

    expect(parent.disposed).toBe(true);
    expect(child.disposed).toBe(true);
    expect(parent.childOwners).toBeNull();
    expect(parent.subscribers).toBeNull();
    expect(child.parent).toBeNull();
    expect(outerSource.subs).toBeNull();
    expect(innerSource.subs).toBeNull();
  });

  it('creates disposed child owners under disposed owners', () => {
    const parent = createOwner();
    let child!: Owner;

    disposeOwner(parent);

    runWithOwner(parent, () => {
      child = createOwner();
    });

    expect(parent.childOwners).toBeNull();
    expect(child.disposed).toBe(true);
    expect(child.parent).toBeNull();
  });

  it('disposes subscribers registered to disposed owners', () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const owner = createOwner();
    const effect = createTextNodeEffect(createText(), createSignal(1), { scheduler });

    disposeOwner(owner);
    registerSubscriberToOwner(effect, owner);

    expect(effect.flags).toBe(ReactiveFlags.Disposed);
    expect(owner.subscribers).toBeNull();
  });

  it('registers computed subscribers with the active owner', () => {
    const owner = createOwner();
    const count = createSignal(1);
    const doubled = runWithOwner(owner, () => createComputed(() => count.value * 2));

    expect(owner.subscribers).toEqual([doubled]);
    expect(doubled.value).toBe(2);
    expect(count.subs).toContain(doubled);

    disposeOwner(owner);

    expect(count.subs).toBeNull();
  });

  it('registers task subscribers with the active owner', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const owner = createOwner();
    const count = createSignal(1);
    const seen: number[] = [];
    let task!: TaskSubscriber;
    let visibleTask!: VisibleTaskSubscriber;

    runWithOwner(owner, () => {
      task = createTask(() => seen.push(count.value), { scheduler });
      visibleTask = createVisibleTask(() => seen.push(count.value + 10), {
        scheduler,
      });
    });

    expect(owner.subscribers).toEqual([task, visibleTask]);

    scheduler.notify(task);
    scheduler.notify(visibleTask);
    await scheduler.flushInteraction();

    expect(seen).toEqual([1, 11]);
    expect(count.subs).toContain(task);
    expect(count.subs).toContain(visibleTask);

    disposeOwner(owner);

    expect(count.subs).toBeNull();
  });

  it('does not track dependencies through runWithOwner', () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const collector = createTask(() => {}, { scheduler });
    const owner = createOwner();
    const tracked = createSignal('tracked');
    const untracked = createSignal('untracked');

    runWithCollector(collector, () => {
      expect(getActiveCollector()).toBe(collector);

      tracked.value;
      runWithOwner(owner, () => {
        expect(getActiveOwner()).toBe(owner);
        expect(getActiveCollector()).toBeNull();
        untracked.value;
      });

      expect(getActiveCollector()).toBe(collector);
    });

    expect(tracked.subs).toEqual([collector]);
    expect(untracked.subs).toBeNull();
  });

  it('restores owner and collector after runWithOwner throws', () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const parent = createOwner();
    const child = createOwner();
    const collector = createTask(() => {}, { scheduler });

    runWithOwner(parent, () => {
      runWithCollector(collector, () => {
        expect(() =>
          runWithOwner(child, () => {
            expect(getActiveOwner()).toBe(child);
            expect(getActiveCollector()).toBeNull();
            throw new Error('boom');
          })
        ).toThrow('boom');

        expect(getActiveOwner()).toBe(parent);
        expect(getActiveCollector()).toBe(collector);
      });
    });

    expect(getActiveOwner()).toBeNull();
    expect(getActiveCollector()).toBeNull();
  });

  it('rejects async scalar text expressions', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const asyncText = createTextExpressionEffect(
      createText(),
      [],
      (() => Promise.resolve('async')) as unknown as TextExpressionFn<[]>,
      { scheduler, phase: Phase.ScalarDom }
    );

    scheduler.notify(asyncText);

    await expect(scheduler.flushInteraction()).rejects.toThrow(
      'Scalar DOM effects must be synchronous'
    );
  });

  it('createTask tracks dependencies and reruns after signal mutation', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const count = createSignal(0);
    const seen: number[] = [];
    const task = createTask(
      () => {
        seen.push(count.value);
      },
      { scheduler }
    );

    scheduler.notify(task);
    await scheduler.flushInteraction();

    expect(seen).toEqual([0]);
    expect(count.subs).toContain(task);

    count.value = 1;
    await scheduler.flushInteraction();

    expect(seen).toEqual([0, 1]);
  });

  it('runs deferred tasks only during deferred flush', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    const task = createTask(() => order.push('deferred'), {
      deferUpdates: true,
      scheduler,
    });

    scheduler.notify(task);
    await scheduler.flushInteraction();

    expect(order).toEqual([]);

    await scheduler.flushDeferred();

    expect(order).toEqual(['deferred']);
  });

  it('loads unresolved task QRLs before running them', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    let resolved = false;
    const qrl = createQRL<TaskFn>(
      'chunk',
      'symbol',
      null,
      () => {
        resolved = true;
        return Promise.resolve({
          symbol: () => {
            order.push('qrl');
          },
        });
      },
      null
    );
    const task = createTaskQrl(qrl, { scheduler });

    scheduler.notify(task);
    await scheduler.flushInteraction();

    expect(resolved).toBe(true);
    expect(order).toEqual(['qrl']);
  });

  it('loads unresolved branch condition QRLs before tracking dependencies', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const visible = createSignal(true);
    const node = createNode('then');
    const { range, replacements } = createBranchRange();
    let resolved = false;
    const conditionQrl = createQRL<BranchConditionFn<[typeof visible]>>(
      'chunk',
      'condition',
      null,
      () => {
        resolved = true;
        return Promise.resolve({
          condition: (source: typeof visible) => source.value,
        });
      },
      null
    );
    const thenQrl = createQRL<BranchRenderFn<[typeof visible]>>(
      'chunk',
      'then',
      (_source: typeof visible) => [node],
      null,
      null
    );
    const branchQrl = createBranchQrl<[typeof visible]>(
      [visible],
      conditionQrl,
      thenQrl,
      undefined
    );
    const branch = createBranchQrlSubscriber(range, branchQrl, { scheduler });

    scheduler.notify(branch);
    await scheduler.flushInteraction();

    expect(resolved).toBe(true);
    expect(replacements).toEqual([[node]]);
    expect(visible.subs).toContain(branch);

    visible.value = false;
    await scheduler.flushInteraction();

    expect(replacements).toEqual([[node], []]);
  });

  it('loads branch render QRLs only when entering their branch', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const visible = createSignal(true);
    const thenNode = createNode('then');
    const elseNode = createNode('else');
    const { range, replacements } = createBranchRange();
    let thenResolved = false;
    let elseResolved = false;
    const thenQrl = createQRL<BranchRenderFn<[typeof visible]>>(
      'chunk',
      'renderThen',
      null,
      () => {
        thenResolved = true;
        return Promise.resolve({
          renderThen: (_source: typeof visible) => [thenNode],
        });
      },
      null
    );
    const elseQrl = createQRL<BranchRenderFn<[typeof visible]>>(
      'chunk',
      'renderElse',
      null,
      () => {
        elseResolved = true;
        return Promise.resolve({
          renderElse: (_source: typeof visible) => [elseNode],
        });
      },
      null
    );
    const branchQrl = createBranchQrl<[typeof visible]>(
      [visible],
      createQRL<BranchConditionFn<[typeof visible]>>(
        'chunk',
        'condition',
        (source: typeof visible) => source.value,
        null,
        null
      ),
      thenQrl,
      elseQrl
    );
    const branch = createBranchQrlSubscriber(range, branchQrl, { scheduler });

    scheduler.notify(branch);
    await scheduler.flushInteraction();

    expect(thenResolved).toBe(true);
    expect(elseResolved).toBe(false);
    expect(replacements).toEqual([[thenNode]]);

    visible.value = false;
    await scheduler.flushInteraction();

    expect(elseResolved).toBe(true);
    expect(replacements).toEqual([[thenNode], [elseNode]]);
  });

  it('resumes mounted branch QRLs without loading the matching renderer', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const visible = createSignal(true);
    const thenNode = createNode('then');
    const { range, replacements } = createBranchRange();
    let conditionResolved = false;
    let thenResolved = false;
    const conditionQrl = createQRL<BranchConditionFn<[typeof visible]>>(
      'chunk',
      'condition',
      null,
      () => {
        conditionResolved = true;
        return Promise.resolve({
          condition: (source: typeof visible) => source.value,
        });
      },
      null
    );
    const thenQrl = createQRL<BranchRenderFn<[typeof visible]>>(
      'chunk',
      'renderThen',
      null,
      () => {
        thenResolved = true;
        return Promise.resolve({
          renderThen: (_source: typeof visible) => [thenNode],
        });
      },
      null
    );
    const branchQrl = createBranchQrl<[typeof visible]>(
      [visible],
      conditionQrl,
      thenQrl,
      undefined
    );
    const branch = createBranchQrlSubscriber(range, branchQrl, {
      scheduler,
      order: 7,
      mountedBranch: BranchState.Then,
    });

    scheduler.notify(branch);
    await scheduler.flushInteraction();

    expect('order' in branchQrl).toBe(false);
    expect('mountedBranch' in branchQrl).toBe(false);
    expect(branch.branch.order).toBe(7);
    expect(conditionResolved).toBe(true);
    expect(thenResolved).toBe(false);
    expect(replacements).toEqual([]);
    expect(visible.subs).toContain(branch);
    expect(branch.branch.currentBranch).toBe(BranchState.Then);
    expect(branch.branch.currentOwner).not.toBeNull();
  });

  it('switches resumed mounted branches and disposes the mounted owner', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const visible = createSignal(true);
    const local = createSignal('mounted');
    const text = createText();
    const elseNode = createNode('else');
    const { range, replacements } = createBranchRange();
    let thenResolved = false;
    let elseResolved = false;
    let effect!: DomSubscriber;
    const branchQrl = createBranchQrl<[typeof visible]>(
      [visible],
      createQRL<BranchConditionFn<[typeof visible]>>(
        'chunk',
        'condition',
        (source: typeof visible) => source.value,
        null,
        null
      ),
      createQRL<BranchRenderFn<[typeof visible]>>(
        'chunk',
        'renderThen',
        null,
        () => {
          thenResolved = true;
          return Promise.resolve({
            renderThen: (_source: typeof visible) => [],
          });
        },
        null
      ),
      createQRL<BranchRenderFn<[typeof visible]>>(
        'chunk',
        'renderElse',
        null,
        () => {
          elseResolved = true;
          return Promise.resolve({
            renderElse: (_source: typeof visible) => [elseNode],
          });
        },
        null
      )
    );
    const branch = createBranchQrlSubscriber(range, branchQrl, {
      scheduler,
      mountedBranch: BranchState.Then,
    });
    const mountedOwner = branch.branch.currentOwner;

    expect(mountedOwner).not.toBeNull();
    runWithOwner(mountedOwner, () => {
      effect = createTextNodeEffect(text, local, { scheduler });
    });

    scheduler.notify(effect);
    scheduler.notify(branch);
    await scheduler.flushInteraction();

    expect(text.data).toBe('mounted');
    expect(local.subs).toContain(effect);
    expect(thenResolved).toBe(false);
    expect(elseResolved).toBe(false);
    expect(replacements).toEqual([]);

    visible.value = false;
    await scheduler.flushInteraction();

    expect(thenResolved).toBe(false);
    expect(elseResolved).toBe(true);
    expect(replacements).toEqual([[elseNode]]);
    expect(local.subs).toBeNull();
    expect(effect.flags).toBe(ReactiveFlags.Disposed);
    expect(branch.branch.currentBranch).toBe(BranchState.Else);
    expect(branch.branch.currentOwner).not.toBe(mountedOwner);
  });

  it('restores serialized captures for branch QRLs', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const container = createCaptureContainer({
      0: 'branch',
      1: 'capture',
    });
    const { range, replacements } = createBranchRange();
    const branchQrl = createBranchQrl<[]>(
      [],
      createQRL<BranchConditionFn<[]>>('chunk', 'condition', () => true, null, null),
      createQRL<BranchRenderFn<[]>>(
        'chunk',
        'renderThen',
        null,
        () =>
          Promise.resolve({
            renderThen: () => [createNode((_captures as readonly string[]).join(':'))],
          }),
        '0 1',
        container
      ),
      undefined,
      { container }
    );
    const branch = createBranchQrlSubscriber(range, branchQrl, { scheduler });

    scheduler.notify(branch);
    await scheduler.flushInteraction();

    expect(getNodeLabel(replacements[0][0])).toBe('branch:capture');
  });

  it('runs visible tasks in enqueue order', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    const second = createVisibleTask(() => order.push('second'), { scheduler });
    const first = createVisibleTaskQrl(
      createQRL<TaskFn>(
        'chunk',
        'symbol',
        () => {
          order.push('first');
        },
        null,
        null
      ),
      { scheduler }
    );

    scheduler.notify(second);
    scheduler.notify(first);
    await scheduler.flushInteraction();

    expect(order).toEqual(['second', 'first']);
  });

  it('starts visible tasks independently', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    let resolveFirst: (() => void) | undefined;
    const first = createVisibleTask(
      () => {
        order.push('first:start');
        return new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      },
      { scheduler }
    );
    const second = createVisibleTask(
      () => {
        order.push('second:start');
      },
      { scheduler }
    );

    scheduler.notify(first);
    scheduler.notify(second);
    await scheduler.flushInteraction();
    resolveFirst?.();

    expect(order).toEqual(['first:start', 'second:start']);
  });

  it('restores serialized captures for task QRLs', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const seen: string[] = [];
    const container = createCaptureContainer({
      0: 'task',
      1: 'capture',
    });
    const qrl = createQRL<TaskFn>(
      'chunk',
      'symbol',
      null,
      () =>
        Promise.resolve({
          symbol: () => {
            seen.push((_captures as readonly string[]).join(':'));
          },
        }),
      '0 1',
      container
    );
    const task = createTaskQrl(qrl, { scheduler, container });

    scheduler.notify(task);
    await scheduler.flushInteraction();

    expect(seen).toEqual(['task:capture']);
  });

  it('loads text expression QRLs with args before patching text', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const text = createText();
    const prefix = createSignal('hello');
    let resolved = false;
    const qrl = createQRL<TextExpressionFn<[string]>>(
      'chunk',
      'symbol',
      null,
      () => {
        resolved = true;
        return Promise.resolve({
          symbol: (suffix: string) => `${prefix.value}:${suffix}`,
        });
      },
      null
    );
    const effect = createTextExpressionEffectQrl(text, ['world'], qrl, { scheduler });

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(resolved).toBe(true);
    expect(text.data).toBe('hello:world');
  });

  it('restores serialized captures for text expression QRLs', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const text = createText();
    const container = createCaptureContainer({
      0: 'text',
      1: 'capture',
    });
    const qrl = createQRL<TextExpressionFn<[string]>>(
      'chunk',
      'symbol',
      null,
      () =>
        Promise.resolve({
          symbol: (suffix: string) => `${(_captures as readonly string[]).join(':')}:${suffix}`,
        }),
      '0 1',
      container
    );
    const effect = createTextExpressionEffectQrl(text, ['qrl'], qrl, {
      scheduler,
      container,
    });

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('text:capture:qrl');
  });

  it('cleans up dynamic dependencies for text expressions', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const useA = createSignal(true);
    const a = createSignal('a');
    const b = createSignal('b');
    const text = createText();
    const effect = createTextExpressionEffect(
      text,
      [useA, a, b],
      (selected, left, right) => (selected.value ? left.value : right.value),
      { scheduler }
    );

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('a');

    useA.value = false;
    await scheduler.flushInteraction();

    expect(text.data).toBe('b');
    expect(a.subs).toBeNull();

    a.value = 'next-a';
    await scheduler.flushInteraction();

    expect(text.data).toBe('b');

    b.value = 'next-b';
    await scheduler.flushInteraction();

    expect(text.data).toBe('next-b');
  });

  it('cleans up dynamic dependencies for tasks', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const useA = createSignal(true);
    const a = createSignal('a');
    const b = createSignal('b');
    const seen: string[] = [];
    const task = createTask(() => seen.push(useA.value ? a.value : b.value), { scheduler });

    scheduler.notify(task);
    await scheduler.flushInteraction();

    useA.value = false;
    await scheduler.flushInteraction();

    expect(a.subs).toBeNull();

    a.value = 'next-a';
    await scheduler.flushInteraction();

    b.value = 'next-b';
    await scheduler.flushInteraction();

    expect(seen).toEqual(['a', 'b', 'next-b']);
  });

  it('cleans up dynamic dependencies for visible tasks', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const useA = createSignal(true);
    const a = createSignal('a');
    const b = createSignal('b');
    const seen: string[] = [];
    const task = createVisibleTask(() => seen.push(useA.value ? a.value : b.value), {
      scheduler,
    });

    scheduler.notify(task);
    await scheduler.flushInteraction();

    useA.value = false;
    await scheduler.flushInteraction();

    expect(a.subs).toBeNull();

    a.value = 'next-a';
    await scheduler.flushInteraction();

    b.value = 'next-b';
    await scheduler.flushInteraction();

    expect(seen).toEqual(['a', 'b', 'next-b']);
  });
});

function createTaskSubscriber(
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

function createOrderTextExpressionEffect(
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

function createIdleSubscriber(notify: () => void): IdleSubscriber {
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

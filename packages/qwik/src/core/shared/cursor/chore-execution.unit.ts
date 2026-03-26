import { assert, expect, vi, beforeEach, describe, it } from 'vitest';
import {
  executeTasks,
  executeNodeDiff,
  executeReconcile,
  executeComponentChore,
  executeNodeProps,
  executeCleanup,
  executeCompute,
  setNodeDiffPayload,
  setNodePropData,
} from './chore-execution';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import { Task, TaskFlags } from '../../use/use-task';
import { VNode } from '../vnode/vnode';
import { VNodeFlags } from '../../client/types';
import type { Container, HostElement } from '../types';
import type { VNodeJournal } from '../../client/vnode-utils';
import type { CursorData } from './cursor-props';
import type { Cursor } from './cursor';
import { ELEMENT_SEQ, ELEMENT_PROPS, OnRenderProp, QScopedStyle } from '../utils/markers';
import type { Props } from '../jsx/jsx-runtime';
import { SignalFlags } from '../../reactive-primitives/types';
import type { ElementVNode } from '../vnode/element-vnode';
import { runTask } from '../../use/use-task';
import { vnode_diff } from '../../client/vnode-diff';
import { reconcileKeyedLoopToParent } from '../../client/reconcile-keyed-loop';
import { executeComponent } from '../component-execution';
import { isSignal, scheduleEffects } from '../../reactive-primitives/utils';
import { invoke, newInvokeContext } from '../../use/use-core';
import { cleanupDestroyable } from '../../use/utils/destroyable';
import { createSetAttributeOperation } from '../vnode/types/dom-vnode-operation';
import type { Signal } from '../../reactive-primitives/signal.public';
import { markVNodeDirty } from '../vnode/vnode-dirty';
import type { QRLInternal } from '../qrl/qrl-class';
import type { JSXOutput } from '../jsx/types/jsx-node';

vi.mock('../../use/use-task', async () => {
  const actual = await vi.importActual<typeof import('../../use/use-task')>('../../use/use-task');
  return {
    ...actual,
    runTask: vi.fn(),
  };
});

vi.mock('../../client/vnode-diff', () => ({
  vnode_diff: vi.fn(),
}));

vi.mock('../../client/reconcile-keyed-loop', () => ({
  reconcileKeyedLoopToParent: vi.fn(),
}));

vi.mock('../component-execution', () => ({
  executeComponent: vi.fn(),
}));

vi.mock('../utils/styles', () => ({
  serializeAttribute: vi.fn((property: string, value: any) => {
    if (value == null) {
      return null;
    }
    return String(value);
  }),
}));

vi.mock('../vnode/types/dom-vnode-operation', async () => {
  const actual = await vi.importActual<typeof import('../vnode/types/dom-vnode-operation')>(
    '../vnode/types/dom-vnode-operation'
  );
  return {
    ...actual,
    createSetAttributeOperation: vi.fn(actual.createSetAttributeOperation),
  };
});

vi.mock('../../reactive-primitives/utils', () => ({
  isSignal: vi.fn((value: any) => value && typeof value === 'object' && 'value' in value),
  scheduleEffects: vi.fn(),
}));

vi.mock('../vnode/vnode-dirty', () => ({
  markVNodeDirty: vi.fn(),
}));

vi.mock('../../use/use-core', () => ({
  invoke: {
    call: vi.fn((target: any, ctx: any, fn: any) => fn?.()),
  },
  newInvokeContext: vi.fn(() => ({
    $container$: null,
  })),
  untrack: vi.fn((value: any) => value?.untrackedValue ?? value?.value ?? value),
}));

vi.mock('../../use/utils/destroyable', () => ({
  cleanupDestroyable: vi.fn(),
}));

vi.mock('../../reactive-primitives/cleanup', () => ({
  clearEffectSubscription: vi.fn(),
  clearAllEffects: vi.fn(),
}));

function createMockVNode(
  flags: VNodeFlags = VNodeFlags.Element,
  dirty: ChoreBits = ChoreBits.NONE
): VNode {
  const vnode = Object.create(VNode.prototype);
  vnode.flags = flags;
  vnode.dirty = dirty;
  vnode.parent = null;
  vnode.previousSibling = null;
  vnode.nextSibling = null;
  vnode.props = {};
  vnode.slotParent = null;
  vnode.dirtyChildren = null;
  vnode.nextDirtyChildIndex = 0;
  return vnode;
}

function createMockContainer(): Container {
  const hostProps = new Map<any, Map<string | symbol, any>>();

  return {
    getHostProp: vi.fn((host: any, prop: string | symbol) => {
      const props = hostProps.get(host);
      return props?.get(prop) ?? null;
    }),
    setHostProp: vi.fn((host: any, prop: string | symbol, value: any) => {
      if (!hostProps.has(host)) {
        hostProps.set(host, new Map());
      }
      hostProps.get(host)!.set(prop, value);
    }),
    handleError: vi.fn((err: any, host: any) => {
      console.error(err);
    }),
    $checkPendingCount$: vi.fn(),
  } as any;
}

function createMockCursorData(container: Container): CursorData {
  return {
    afterFlushTasks: null,
    extraPromises: null,
    journal: null,
    container,
    position: null,
    priority: 0,
    promise: null,
    ssrBuildState: null,
    onDone: null,
  };
}

function createMockTask(flags: TaskFlags, el: HostElement): Task {
  const task = Object.create(Task.prototype);
  task.$flags$ = flags;
  task.$index$ = 0;
  task.$el$ = el;
  task.$qrl$ = {} as any;
  task.$state$ = undefined;
  task.$destroy$ = null;
  return task;
}

function createResolvedQrl<T>(value: T): QRLInternal<T> {
  return {
    resolved: value,
    resolve: vi.fn().mockResolvedValue(value),
  } as any;
}

function createUnresolvedQrl<T>(value: T): QRLInternal<T> {
  return {
    resolved: undefined,
    resolve: vi.fn().mockResolvedValue(value),
  } as any;
}

describe('executeTasks', () => {
  let container: Container;
  let cursorData: CursorData;
  let vNode: VNode;

  beforeEach(() => {
    vi.clearAllMocks();
    container = createMockContainer();
    cursorData = createMockCursorData(container);
    vNode = createMockVNode(VNodeFlags.Element, ChoreBits.TASKS);
  });

  it('should clear TASKS dirty bit', () => {
    executeTasks(vNode, container, cursorData);
    assert.equal(vNode.dirty & ChoreBits.TASKS, 0);
  });

  it('should return early if no elementSeq', () => {
    executeTasks(vNode, container, cursorData);
    expect(runTask).not.toHaveBeenCalled();
  });

  it('should return early if elementSeq is empty', () => {
    container.setHostProp(vNode, ELEMENT_SEQ, []);
    executeTasks(vNode, container, cursorData);
    expect(runTask).not.toHaveBeenCalled();
  });

  it('should skip task if not dirty', () => {
    const task = createMockTask(TaskFlags.TASK, vNode as any);
    task.$flags$ = TaskFlags.TASK; // Not dirty
    container.setHostProp(vNode, ELEMENT_SEQ, [task]);

    executeTasks(vNode, container, cursorData);
    expect(runTask).not.toHaveBeenCalled();
  });

  it('should store visible task in afterFlushTasks', () => {
    const task = createMockTask(TaskFlags.VISIBLE_TASK | TaskFlags.DIRTY, vNode as any);
    container.setHostProp(vNode, ELEMENT_SEQ, [task]);

    executeTasks(vNode, container, cursorData);

    expect(cursorData.afterFlushTasks).toEqual([task]);
    expect(runTask).not.toHaveBeenCalled();
  });

  it('should run regular task synchronously', () => {
    const task = createMockTask(TaskFlags.TASK | TaskFlags.DIRTY, vNode as any);
    container.setHostProp(vNode, ELEMENT_SEQ, [task]);
    vi.mocked(runTask).mockReturnValue(undefined);

    const result = executeTasks(vNode, container, cursorData);

    expect(runTask).toHaveBeenCalledWith(task, container, vNode);
    expect(result).toBe(undefined);
  });

  it('should chain promises for render-blocking tasks', () => {
    const task1 = createMockTask(
      TaskFlags.TASK | TaskFlags.DIRTY | TaskFlags.RENDER_BLOCKING,
      vNode as any
    );
    const task2 = createMockTask(
      TaskFlags.TASK | TaskFlags.DIRTY | TaskFlags.RENDER_BLOCKING,
      vNode as any
    );
    container.setHostProp(vNode, ELEMENT_SEQ, [task1, task2]);

    const promise1 = Promise.resolve();
    const promise2 = Promise.resolve();
    vi.mocked(runTask).mockReturnValueOnce(promise1).mockReturnValueOnce(promise2);

    const result = executeTasks(vNode, container, cursorData);

    expect(result).toBeInstanceOf(Promise);
  });

  it('should add non-blocking task promises to extraPromises', () => {
    const task = createMockTask(TaskFlags.TASK | TaskFlags.DIRTY, vNode as any);
    container.setHostProp(vNode, ELEMENT_SEQ, [task]);

    const promise = Promise.resolve();
    vi.mocked(runTask).mockReturnValue(promise);

    executeTasks(vNode, container, cursorData);

    expect(cursorData.extraPromises).toEqual([promise]);
  });

  it('should handle multiple tasks of different types', () => {
    const visibleTask = createMockTask(TaskFlags.VISIBLE_TASK | TaskFlags.DIRTY, vNode as any);
    const regularTask = createMockTask(TaskFlags.TASK | TaskFlags.DIRTY, vNode as any);

    container.setHostProp(vNode, ELEMENT_SEQ, [visibleTask, regularTask]);
    vi.mocked(runTask).mockReturnValue(undefined);

    executeTasks(vNode, container, cursorData);

    expect(cursorData.afterFlushTasks).toEqual([visibleTask]);
    expect(runTask).toHaveBeenCalledWith(regularTask, container, vNode);
  });
});

describe('executeNodeDiff', () => {
  let container: Container;
  let journal: VNodeJournal;
  let cursor: Cursor;
  let vNode: VNode;

  beforeEach(() => {
    vi.clearAllMocks();
    container = createMockContainer();
    journal = [] as VNodeJournal;
    cursor = {} as Cursor;
    vNode = createMockVNode(VNodeFlags.Element, ChoreBits.NODE_DIFF);
  });

  it('should clear NODE_DIFF dirty bit', () => {
    executeNodeDiff(vNode, container, journal, cursor);
    assert.equal(vNode.dirty & ChoreBits.NODE_DIFF, 0);
  });

  it('should return early if no diff payload', () => {
    executeNodeDiff(vNode, container, journal, cursor);
    expect(vnode_diff).not.toHaveBeenCalled();
  });

  it('should call vnode_diff with JSX payload', () => {
    const jsx = { type: 'div', props: {}, children: [] };
    setNodeDiffPayload(vNode, jsx as any);

    executeNodeDiff(vNode, container, journal, cursor);

    expect(vnode_diff).toHaveBeenCalledWith(container, journal, jsx, vNode, cursor, null);
  });

  it('should apply scoped style prefix from the host', () => {
    const jsx = { type: 'div', props: {}, children: [] };
    container.setHostProp(vNode, QScopedStyle, 'scope-123');
    setNodeDiffPayload(vNode, jsx as any);

    executeNodeDiff(vNode, container, journal, cursor);

    expect(vnode_diff).toHaveBeenCalledWith(container, journal, jsx, vNode, cursor, '⚡️scope-123');
  });

  it('should unwrap signal payload', () => {
    const jsx = { type: 'div', props: {}, children: [] };
    const signal = { value: jsx };
    setNodeDiffPayload(vNode, signal as any);

    executeNodeDiff(vNode, container, journal, cursor);

    expect(vnode_diff).toHaveBeenCalledWith(container, journal, jsx, vNode, cursor, null);
  });

  it('should return promise if vnode_diff returns promise', async () => {
    const jsx = { type: 'div', props: {}, children: [] };
    setNodeDiffPayload(vNode, jsx as any);

    const promise = Promise.resolve();
    vi.mocked(vnode_diff).mockReturnValue(promise as any);

    const result = executeNodeDiff(vNode, container, journal, cursor);

    expect(result).toBeInstanceOf(Promise);
    await result;
  });
});

describe('executeReconcile', () => {
  let container: Container;
  let journal: VNodeJournal;
  let cursor: Cursor;
  let vNode: VNode;

  beforeEach(() => {
    vi.clearAllMocks();
    container = createMockContainer();
    journal = [] as VNodeJournal;
    cursor = {} as Cursor;
    vNode = createMockVNode(VNodeFlags.Element, ChoreBits.RECONCILE);
  });

  it('should clear RECONCILE dirty bit', () => {
    executeReconcile(vNode, container, journal, cursor);
    assert.equal(vNode.dirty & ChoreBits.RECONCILE, 0);
  });

  it('should return early if no props', () => {
    executeReconcile(vNode, container, journal, cursor);
    expect(reconcileKeyedLoopToParent).not.toHaveBeenCalled();
  });

  it('should reconcile synchronously when key$ and item$ are already resolved', () => {
    const items = [{ id: '1' }];
    const keyOf = vi.fn((item: { id: string }) => item.id);
    const itemFn = vi.fn((item: { id: string }) => ({
      type: 'tr',
      props: {},
      children: [item.id],
    }));

    container.setHostProp(vNode, ELEMENT_PROPS, {
      items,
      key$: createResolvedQrl(keyOf),
      item$: createResolvedQrl(itemFn),
    } as Props);

    vi.mocked(reconcileKeyedLoopToParent).mockReturnValue(undefined as any);

    const result = executeReconcile(vNode, container, journal, cursor);

    expect(result).toBe(undefined);
    expect(reconcileKeyedLoopToParent).toHaveBeenCalledWith(
      container,
      journal,
      vNode,
      cursor,
      items,
      keyOf,
      itemFn
    );
  });

  it('should return a promise when key$ or item$ needs resolution', async () => {
    const items = [{ id: '1' }];
    const keyOf = vi.fn((item: { id: string }) => item.id);
    const itemFn = vi.fn((item: { id: string }) => ({
      type: 'tr',
      props: {},
      children: [item.id],
    }));
    const keyQrl = createUnresolvedQrl(keyOf);
    const itemQrl = createUnresolvedQrl(itemFn);

    container.setHostProp(vNode, ELEMENT_PROPS, {
      items,
      key$: keyQrl,
      item$: itemQrl,
    } as Props);

    vi.mocked(reconcileKeyedLoopToParent).mockReturnValue(undefined as any);

    const result = executeReconcile(vNode, container, journal, cursor);

    expect(result).toBeInstanceOf(Promise);
    await result;

    expect(keyQrl.resolve).toHaveBeenCalledTimes(1);
    expect(itemQrl.resolve).toHaveBeenCalledTimes(1);
    expect(reconcileKeyedLoopToParent).toHaveBeenCalledWith(
      container,
      journal,
      vNode,
      cursor,
      items,
      keyOf,
      itemFn
    );
  });

  it('should unwrap signal-backed items before reconciling', () => {
    const items = [{ id: '1' }];
    const keyOf = vi.fn((item: { id: string }) => item.id);
    const itemFn = vi.fn(
      (item: { id: string }): JSXOutput => ({ type: 'tr', props: {}, children: [item.id] }) as any
    );

    container.setHostProp(vNode, ELEMENT_PROPS, {
      items: { value: items },
      key$: createResolvedQrl(keyOf),
      item$: createResolvedQrl(itemFn),
    } as Props);

    vi.mocked(reconcileKeyedLoopToParent).mockReturnValue(undefined as any);

    executeReconcile(vNode, container, journal, cursor);

    expect(reconcileKeyedLoopToParent).toHaveBeenCalledWith(
      container,
      journal,
      vNode,
      cursor,
      items,
      keyOf,
      itemFn
    );
  });
});

describe('executeComponentChore', () => {
  let container: Container;
  let journal: VNodeJournal;
  let cursor: Cursor;
  let vNode: VNode;

  beforeEach(() => {
    vi.clearAllMocks();
    container = createMockContainer();
    journal = [] as VNodeJournal;
    cursor = {} as Cursor;
    vNode = createMockVNode(VNodeFlags.Element, ChoreBits.COMPONENT);
  });

  it('should clear COMPONENT dirty bit', () => {
    executeComponentChore(vNode, container, journal, cursor);
    assert.equal(vNode.dirty & ChoreBits.COMPONENT, 0);
  });

  it('should return early if no component QRL', () => {
    executeComponentChore(vNode, container, journal, cursor);
    expect(executeComponent).not.toHaveBeenCalled();
  });

  it('should execute component and schedule node diff result', () => {
    const componentQRL = { getSymbol: () => 'component' } as any;
    const props = { id: 'test' } as Props;
    const jsx = { type: 'div', props: {}, children: [] };

    container.setHostProp(vNode, OnRenderProp, componentQRL);
    container.setHostProp(vNode, ELEMENT_PROPS, props);

    vi.mocked(executeComponent).mockReturnValue(jsx as any);

    executeComponentChore(vNode, container, journal, cursor);

    expect(executeComponent).toHaveBeenCalledWith(container, vNode, vNode, componentQRL, props);
    expect(vnode_diff).not.toHaveBeenCalled();
    expect((vNode.props as any)[':nodeDiff']).toBe(jsx);
    expect(markVNodeDirty).toHaveBeenCalledWith(container, vNode, ChoreBits.NODE_DIFF, cursor);
  });

  it('should handle component execution error', () => {
    const componentQRL = { getSymbol: () => 'component' } as any;
    const error = new Error('Component error');

    container.setHostProp(vNode, OnRenderProp, componentQRL);

    vi.mocked(executeComponent).mockImplementation(() => {
      throw error;
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    executeComponentChore(vNode, container, journal, cursor);

    expect(container.handleError).toHaveBeenCalledWith(error, vNode);

    consoleErrorSpy.mockRestore();
  });

  it('should return promise if execution is async', async () => {
    const componentQRL = { getSymbol: () => 'component' } as any;
    const jsx = { type: 'div', props: {}, children: [] };

    container.setHostProp(vNode, OnRenderProp, componentQRL);

    vi.mocked(executeComponent).mockReturnValue(Promise.resolve(jsx as any));

    const result = executeComponentChore(vNode, container, journal, cursor);

    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(vnode_diff).not.toHaveBeenCalled();
    expect((vNode.props as any)[':nodeDiff']).toBe(jsx);
    expect(markVNodeDirty).toHaveBeenCalledWith(container, vNode, ChoreBits.NODE_DIFF, cursor);
  });

  it('should keep only the latest node diff payload before diffing', () => {
    const componentQRL = { getSymbol: () => 'component' } as any;
    const jsx1 = { type: 'div', props: { id: 'one' }, children: [] };
    const jsx2 = { type: 'div', props: { id: 'two' }, children: [] };

    container.setHostProp(vNode, OnRenderProp, componentQRL);
    vi.mocked(executeComponent)
      .mockReturnValueOnce(jsx1 as any)
      .mockReturnValueOnce(jsx2 as any);

    executeComponentChore(vNode, container, journal, cursor);
    vNode.dirty |= ChoreBits.COMPONENT;
    executeComponentChore(vNode, container, journal, cursor);
    executeNodeDiff(vNode, container, journal, cursor);

    expect(vnode_diff).toHaveBeenCalledTimes(1);
    expect(vnode_diff).toHaveBeenCalledWith(container, journal, jsx2, vNode, cursor, null);
  });
});

describe('executeNodeProps', () => {
  let journal: VNodeJournal;
  let vNode: ElementVNode;

  beforeEach(() => {
    vi.clearAllMocks();
    journal = [] as VNodeJournal;
    const mockVNode = createMockVNode(VNodeFlags.Element, ChoreBits.NODE_PROPS);
    // Cast to ElementVNode and add the node property
    vNode = Object.assign(Object.create(Object.getPrototypeOf(mockVNode)), mockVNode, {
      node: {} as Element,
    }) as ElementVNode;
  });

  it('should clear NODE_PROPS dirty bit', () => {
    executeNodeProps(vNode, journal);
    assert.equal(vNode.dirty & ChoreBits.NODE_PROPS, 0);
  });

  it('should return early if vNode is not an element', () => {
    vNode.flags = VNodeFlags.Text;
    executeNodeProps(vNode, journal);
    expect(journal.length).toBe(0);
  });

  it('should return early if no prop data', () => {
    executeNodeProps(vNode, journal);
    expect(journal.length).toBe(0);
  });

  it('should process single node prop', () => {
    setNodePropData(vNode, 'id', {
      value: 'test-id',
      isConst: false,
      scopedStyleIdPrefix: null,
    });

    executeNodeProps(vNode, journal);

    expect(journal.length).toBe(1);
    expect(journal[0]).toEqual({
      target: vNode.node,
      attrName: 'id',
      attrValue: 'test-id',
      scopedStyleIdPrefix: null,
      isSvg: false,
    });
    expect(vNode.props!['id']).toBe('test-id');
  });

  it('should process multiple node props', () => {
    setNodePropData(vNode, 'id', {
      value: 'test-id',
      isConst: false,
      scopedStyleIdPrefix: null,
    });
    setNodePropData(vNode, 'class', {
      value: 'test-class',
      isConst: false,
      scopedStyleIdPrefix: null,
    });

    executeNodeProps(vNode, journal);

    expect(journal.length).toBe(2);
  });

  it('should unwrap signal values', () => {
    const signal = { value: 'signal-value' };
    vi.mocked(isSignal).mockReturnValue(true);

    setNodePropData(vNode, 'data-test', {
      value: signal as any,
      isConst: false,
      scopedStyleIdPrefix: null,
    });

    executeNodeProps(vNode, journal);

    expect(createSetAttributeOperation).toHaveBeenCalledWith(
      vNode.node,
      'data-test',
      'signal-value',
      null,
      false
    );
  });

  it('should handle null attribute values', () => {
    vNode.props = { id: 'old-id' };

    setNodePropData(vNode, 'id', {
      value: {
        value: null,
      } as Signal<any>,
      isConst: false,
      scopedStyleIdPrefix: null,
    });

    executeNodeProps(vNode, journal);

    expect(journal[0]).toEqual({
      target: vNode.node,
      attrName: 'id',
      attrValue: null,
      scopedStyleIdPrefix: null,
      isSvg: false,
    });
    expect(vNode.props!['id']).toBeUndefined();
  });

  it('should not update vNode props for const attributes', () => {
    setNodePropData(vNode, 'id', {
      value: 'const-id',
      isConst: true,
      scopedStyleIdPrefix: null,
    });

    executeNodeProps(vNode, journal);

    expect(journal.length).toBe(1);
    expect(vNode.props!['id']).toBeUndefined();
  });

  it('should apply scoped style prefix', () => {
    vi.mocked(isSignal).mockReturnValue(false);
    setNodePropData(vNode, 'class', {
      value: 'my-class',
      isConst: false,
      scopedStyleIdPrefix: 'scope-123',
    });

    executeNodeProps(vNode, journal);

    expect(createSetAttributeOperation).toHaveBeenCalledWith(
      vNode.node,
      'class',
      'my-class',
      'scope-123',
      false
    );
  });
});

describe('executeCleanup', () => {
  let container: Container;
  let vNode: VNode;

  beforeEach(() => {
    vi.clearAllMocks();
    container = createMockContainer();
    vNode = createMockVNode(VNodeFlags.Element, ChoreBits.CLEANUP);
  });

  it('should clear CLEANUP dirty bit', () => {
    executeCleanup(vNode, container);
    assert.equal(vNode.dirty & ChoreBits.CLEANUP, 0);
  });

  it('should return early if no elementSeq', () => {
    executeCleanup(vNode, container);
    expect(cleanupDestroyable).not.toHaveBeenCalled();
  });

  it('should return early if elementSeq is empty', () => {
    container.setHostProp(vNode, ELEMENT_SEQ, []);
    executeCleanup(vNode, container);
    expect(cleanupDestroyable).not.toHaveBeenCalled();
  });

  it('should cleanup task that needs cleanup', () => {
    const task = createMockTask(TaskFlags.TASK | TaskFlags.NEEDS_CLEANUP, vNode as any);
    container.setHostProp(vNode, ELEMENT_SEQ, [task]);

    executeCleanup(vNode, container);

    expect(cleanupDestroyable).toHaveBeenCalledWith(task);
    expect(task.$flags$ & TaskFlags.NEEDS_CLEANUP).toBe(0);
  });

  it('should skip task that does not need cleanup', () => {
    const task = createMockTask(TaskFlags.TASK, vNode as any);
    container.setHostProp(vNode, ELEMENT_SEQ, [task]);

    executeCleanup(vNode, container);

    expect(cleanupDestroyable).not.toHaveBeenCalled();
  });

  it('should cleanup multiple tasks', () => {
    const task1 = createMockTask(TaskFlags.TASK | TaskFlags.NEEDS_CLEANUP, vNode as any);
    const task2 = createMockTask(TaskFlags.TASK | TaskFlags.NEEDS_CLEANUP, vNode as any);
    const task3 = createMockTask(TaskFlags.TASK, vNode as any);

    container.setHostProp(vNode, ELEMENT_SEQ, [task1, task2, task3]);

    executeCleanup(vNode, container);

    expect(cleanupDestroyable).toHaveBeenCalledTimes(2);
    expect(cleanupDestroyable).toHaveBeenCalledWith(task1);
    expect(cleanupDestroyable).toHaveBeenCalledWith(task2);
  });

  it('should skip non-task items in elementSeq', () => {
    const task = createMockTask(TaskFlags.TASK | TaskFlags.NEEDS_CLEANUP, vNode as any);
    const nonTask = { some: 'object' };

    container.setHostProp(vNode, ELEMENT_SEQ, [nonTask, task]);

    executeCleanup(vNode, container);

    expect(cleanupDestroyable).toHaveBeenCalledTimes(1);
    expect(cleanupDestroyable).toHaveBeenCalledWith(task);
  });
});

describe('executeCompute', () => {
  let container: Container;
  let vNode: VNode;

  beforeEach(() => {
    vi.clearAllMocks();
    container = createMockContainer();
    vNode = createMockVNode(VNodeFlags.Element, ChoreBits.COMPUTE);
  });

  it('should clear COMPUTE dirty bit', () => {
    executeCompute(vNode, container);
    assert.equal(vNode.dirty & ChoreBits.COMPUTE, 0);
  });

  it('should return early if no host signal', () => {
    executeCompute(vNode, container);
    expect(invoke.call).not.toHaveBeenCalled();
  });

  it('should compute signal value', () => {
    const signal = {
      $flags$: 0,
      $effects$: [],
      $computeIfNeeded$: vi.fn(),
    };

    container.setHostProp(vNode, ':signal', signal);

    executeCompute(vNode, container);

    expect(newInvokeContext).toHaveBeenCalled();
    expect(invoke.call).toHaveBeenCalled();
  });

  it('should schedule effects if RUN_EFFECTS flag is set', async () => {
    const effects = [vi.fn()];
    const signal = {
      $flags$: SignalFlags.RUN_EFFECTS,
      $effects$: effects,
      $computeIfNeeded$: vi.fn(),
    };

    container.setHostProp(vNode, ':signal', signal);

    await executeCompute(vNode, container);

    expect(scheduleEffects).toHaveBeenCalledWith(container, signal, effects);
    expect(signal.$flags$ & SignalFlags.RUN_EFFECTS).toBe(0);
  });

  it('should not schedule effects if flag is not set', async () => {
    const signal = {
      $flags$: 0,
      $effects$: [],
      $computeIfNeeded$: vi.fn(),
    };

    container.setHostProp(vNode, ':signal', signal);

    await executeCompute(vNode, container);

    expect(scheduleEffects).not.toHaveBeenCalled();
  });

  it('should handle async computation', async () => {
    const signal = {
      $flags$: 0,
      $effects$: [],
      $computeIfNeeded$: vi.fn(),
    };

    container.setHostProp(vNode, ':signal', signal);

    vi.mocked(invoke.call).mockReturnValue(Promise.resolve());

    const result = executeCompute(vNode, container);

    expect(result).toBeInstanceOf(Promise);
    await result;
  });

  it('should handle computation that returns a promise', async () => {
    const effects = [vi.fn()];
    const signal = {
      $flags$: SignalFlags.RUN_EFFECTS,
      $effects$: effects,
      $computeIfNeeded$: vi.fn(),
    };

    container.setHostProp(vNode, ':signal', signal);

    vi.mocked(invoke.call).mockReturnValue(Promise.resolve());

    const result = executeCompute(vNode, container);

    expect(result).toBeInstanceOf(Promise);
    await result;

    expect(scheduleEffects).toHaveBeenCalledWith(container, signal, effects);
  });
});

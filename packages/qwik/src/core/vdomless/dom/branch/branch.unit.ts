import { describe, expect, it } from 'vitest';
import { _captures, createQRL } from '../../../shared/qrl/qrl-class';
import {
  createBranchRange,
  createCaptureContainer,
  createNode,
  createTestDomNode,
  createTestParentNode,
  createText,
  getNodeLabel,
  noopSchedule,
} from '../../test-utils';
import { createComponent } from '../../component/component';
import { disposeSubscriber } from '../../reactive/cleanup';
import { ReactiveFlags } from '../../reactive/flags';
import { createSignal } from '../../reactive/signal';
import { createTextExpressionEffect, createTextNodeEffect } from '../effect/effect';
import {
  getActiveInvokeContext,
  getActiveInvokeContextOrNull,
  invoke,
  newInvokeContext,
  type RuntimeInvokeContext,
  type SlotScope,
} from '../../runtime/invoke-context';
import type { ContextScope } from '../../runtime/context-scope';
import { createOwner, runWithOwner } from '../../runtime/owner';
import { Scheduler } from '../../runtime/scheduler';
import type { BranchSubscriber, DomSubscriber } from '../../runtime/subscriber';
import {
  BranchState,
  createBranch,
  createBranchQrl,
  createBranchQrlSubscriber,
  createBranchRange as createMarkerBranchRange,
  type BranchConditionFn,
  type BranchRenderFn,
} from './branch';

describe('branches', () => {
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

  it('restores branch invoke contexts before creating components', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const rootOwner = createOwner();
    const contextScope: ContextScope = {
      id: 'branch-context',
      parent: null,
      values: new Map(),
    };
    const slotScope: SlotScope = {
      id: 'branch-slot',
      slots: new Map(),
    };
    const branchContext = newInvokeContext({
      owner: rootOwner,
      idPrefix: 'branch-',
      contextScope,
      slotScope,
    });
    const visible = createSignal(true);
    const branchNode = createNode('branch');
    const componentNode = createNode('component');
    const { range, replacements } = createBranchRange();
    let conditionContext: RuntimeInvokeContext | null = null;
    let componentContext!: RuntimeInvokeContext;

    const branch = invoke(branchContext, () =>
      createBranch<[typeof visible]>(
        range,
        [visible],
        (source) => {
          conditionContext = getActiveInvokeContextOrNull();
          return source.value;
        },
        () => {
          const nodes = createComponent(null, () => {
            componentContext = getActiveInvokeContext();
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
    expect(componentContext.owner!.parent).toBe(branch.branch.currentOwner);
    expect(componentContext.idPrefix).toBe('branch-');
    expect(componentContext.contextScope).toBe(contextScope);
    expect(componentContext.slotScope).toBe(slotScope);
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

  it('flushes branches before scalar DOM effects', async () => {
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
      { scheduler }
    );
    const effect = createTextExpressionEffect(
      createText(),
      [],
      () => {
        order.push('effect');
        return 'effect';
      },
      { scheduler }
    );

    scheduler.notify(effect);
    scheduler.notify(branch);
    await scheduler.flushInteraction();

    expect(order).toEqual(['branch', 'effect']);
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
});

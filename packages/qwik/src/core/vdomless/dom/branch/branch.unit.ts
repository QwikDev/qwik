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
import { createSignal } from '../../reactive/signal';
import { createTextExpressionEffect, createTextNodeEffect } from '../effect/effect';
import { createSsrElementTextTarget, renderSsrTextNode } from '../effect/ssr-effect';
import {
  getActiveInvokeContext,
  getActiveInvokeContextOrNull,
  invoke,
  newInvokeContext,
  type RuntimeInvokeContext,
} from '../../runtime/invoke-context';
import type { ContextScope } from '../../runtime/context-scope';
import type { SlotScope } from '../slot/slot';
import { createOwner, registerSubscriberToOwner, runWithOwner } from '../../runtime/owner';
import { Scheduler } from '../../runtime/scheduler';
import type { ValueOrPromise } from '../../../shared/utils/types';
import type { BranchSubscriber, DomSubscriber } from '../../runtime/subscriber';
import type { ContainerContext } from '../../runtime/container-context';
import {
  BranchRange,
  BranchSubscription,
  SSRBranchSubscription,
  createBranch,
  renderSsrBranch,
} from './branch';

type BranchConditionFn = () => boolean;
type BranchRenderFn = (ctx: ContainerContext) => readonly Node[];
type SsrBranchRenderFn = (ctx: ContainerContext) => ValueOrPromise<string>;

const BRANCH_THEN = 0;
const BRANCH_ELSE = 1;

describe('branches', () => {
  it('creates branch ranges from comment markers', () => {
    const start = createTestDomNode('start');
    const oldA = createTestDomNode('old-a');
    const oldB = createTestDomNode('old-b');
    const end = createTestDomNode('end');
    const nextA = createTestDomNode('next-a');
    const nextB = createTestDomNode('next-b');
    const parent = createTestParentNode([start, oldA, oldB, end]);
    const range = new BranchRange(
      start.ownerDocument,
      start as unknown as Comment,
      end as unknown as Comment
    );

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
    const scheduler = new Scheduler(noopSchedule);
    const rootOwner = createOwner();
    const contextScope: ContextScope = {
      id: 'branch-context',
      parent: null,
      values: new Map(),
    };
    const slotScope: SlotScope = {
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
      createBranch(
        { scheduler } as ContainerContext,
        range,
        () => {
          conditionContext = getActiveInvokeContextOrNull();
          return visible.value;
        },
        () => {
          const nodes = createComponent(null, () => {
            componentContext = getActiveInvokeContext();
            return [componentNode];
          });
          return nodes.length === 0 ? [branchNode] : nodes;
        }
      )
    );

    scheduler.notify(branch);
    await scheduler.flushInteraction();

    expect(conditionContext).toBe(branchContext);
    expect(componentContext.owner).toBeNull();
    expect(componentContext.idPrefix).toBe('branch-');
    expect(componentContext.contextScope).toBe(contextScope);
    expect(componentContext.slotScope).toBe(slotScope);
    expect(replacements).toEqual([[componentNode]]);
  });

  it('runs CSR branches and switches branch owners', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const visible = createSignal(true);
    const branchText = createSignal('then');
    const { range, replacements } = createBranchRange();
    const thenNode = createNode('then');
    const elseNode = createNode('else');
    const text = createText();
    let thenRuns = 0;
    let elseRuns = 0;

    const branch = createOwned(() =>
      createBranch(
        { scheduler } as ContainerContext,
        range,
        () => visible.value,
        () => {
          thenRuns++;
          const effect = createTextNodeEffect(text, branchText, { scheduler });
          scheduler.notify(effect);
          return [thenNode];
        },
        () => {
          elseRuns++;
          return [elseNode];
        }
      )
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

  it('runs CSR branches with scalar node output', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const node = createNode('then');
    const { range, replacements } = createBranchRange();
    const branch = createOwned(() =>
      createBranch(
        { scheduler } as ContainerContext,
        range,
        () => true,
        () => node
      )
    );

    scheduler.notify(branch);
    await scheduler.flushInteraction();

    expect(replacements).toEqual([[node]]);
  });

  it('does not rerender CSR branches when branch state is unchanged', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = createSignal(1);
    const { range, replacements } = createBranchRange();
    const node = createNode('positive');
    let renderRuns = 0;
    const branch = createOwned(() =>
      createBranch(
        { scheduler } as ContainerContext,
        range,
        () => count.value > 0,
        () => {
          renderRuns++;
          return [node];
        }
      )
    );

    scheduler.notify(branch);
    await scheduler.flushInteraction();

    count.value = 2;
    await scheduler.flushInteraction();

    expect(replacements).toEqual([[node]]);
    expect(renderRuns).toBe(1);
  });

  it('runs branch renderers only when counter changes branch state', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = createSignal(0);
    const zeroNode = createNode('zero');
    const positiveNode = createNode('positive');
    const { range, replacements } = createBranchRange();
    let zeroRuns = 0;
    let positiveRuns = 0;
    const branch = createOwned(() =>
      createBranch(
        { scheduler } as ContainerContext,
        range,
        () => count.value > 0,
        () => {
          positiveRuns++;
          return [positiveNode];
        },
        () => {
          zeroRuns++;
          return [zeroNode];
        }
      )
    );

    scheduler.notify(branch);
    await scheduler.flushInteraction();

    count.value = 1;
    await scheduler.flushInteraction();

    count.value = 2;
    await scheduler.flushInteraction();

    count.value = 0;
    await scheduler.flushInteraction();

    expect(replacements).toEqual([[zeroNode], [positiveNode], [zeroNode]]);
    expect(zeroRuns).toBe(2);
    expect(positiveRuns).toBe(1);
  });

  it('flushes branches before scalar DOM effects', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const order: string[] = [];
    const { range } = createBranchRange();
    let branch!: BranchSubscriber;
    let effect!: DomSubscriber;
    runWithOwner(createOwner(null), () => {
      branch = createBranch(
        { scheduler } as ContainerContext,
        range,
        () => true,
        () => {
          order.push('branch');
          return [];
        }
      );
      effect = createTextExpressionEffect(
        createText(),
        [],
        () => {
          order.push('effect');
          return 'effect';
        },
        { scheduler }
      );
    });

    scheduler.notify(effect);
    scheduler.notify(branch);
    await scheduler.flushInteraction();

    expect(order).toEqual(['branch', 'effect']);
  });

  it('skips disposed branches that were already scheduled', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const { range, replacements } = createBranchRange();
    let runs = 0;
    const branch = createOwned(() =>
      createBranch(
        { scheduler } as ContainerContext,
        range,
        () => true,
        () => {
          runs++;
          return [];
        }
      )
    );

    scheduler.notify(branch);
    disposeSubscriber(branch);
    scheduler.notify(branch);
    await scheduler.flushInteraction();

    expect(runs).toBe(0);
    expect(replacements).toEqual([[]]);
    expect(branch.owner).toBeNull();
  });

  it('disposes active branch owners and clears branch ranges', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const visible = createSignal(true);
    const local = createSignal('local');
    const text = createText();
    const node = createNode('branch');
    const { range, replacements } = createBranchRange();
    const branch = createOwned(() =>
      createBranch(
        { scheduler } as ContainerContext,
        range,
        () => visible.value,
        () => {
          const effect = createTextNodeEffect(text, local, { scheduler });
          scheduler.notify(effect);
          return [node];
        }
      )
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
    const scheduler = new Scheduler(noopSchedule);
    const visible = createSignal(true);
    const node = createNode('then');
    const { range, replacements } = createBranchRange();
    let resolved = false;
    const conditionQrl = createQRL<BranchConditionFn>('chunk', 'condition', null, () => {
      resolved = true;
      return Promise.resolve({
        condition: () => visible.value,
      });
    });
    const thenQrl = createQRL<BranchRenderFn>('chunk', 'then', () => [node]);
    const branch = createOwned(() =>
      createBranch({ scheduler } as ContainerContext, range, conditionQrl, thenQrl)
    );

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
    const scheduler = new Scheduler(noopSchedule);
    const visible = createSignal(true);
    const thenNode = createNode('then');
    const elseNode = createNode('else');
    const { range, replacements } = createBranchRange();
    let thenResolved = false;
    let elseResolved = false;
    const thenQrl = createQRL<BranchRenderFn>('chunk', 'renderThen', null, () => {
      thenResolved = true;
      return Promise.resolve({
        renderThen: () => [thenNode],
      });
    });
    const elseQrl = createQRL<BranchRenderFn>('chunk', 'renderElse', null, () => {
      elseResolved = true;
      return Promise.resolve({
        renderElse: () => [elseNode],
      });
    });
    const branch = createOwned(() =>
      createBranch({ scheduler } as ContainerContext, range, () => visible.value, thenQrl, elseQrl)
    );

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

  it('resumes mounted branches without loading the matching renderer', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const visible = createSignal(true);
    const thenNode = createNode('then');
    const { range, replacements } = createBranchRange();
    let thenResolved = false;
    const thenQrl = createQRL<BranchRenderFn>('chunk', 'renderThen', null, () => {
      thenResolved = true;
      return Promise.resolve({
        renderThen: () => [thenNode],
      });
    });
    const branch = createOwned(() =>
      registerSubscriberToOwner(
        new BranchSubscription(
          {
            range,
            conditionFn: () => visible.value,
            thenFn: thenQrl,
            elseFn: undefined,
            currentBranch: BRANCH_THEN,
            currentOwner: null,
            invokeContext: getActiveInvokeContextOrNull(),
            container: { scheduler } as ContainerContext,
            dispose() {
              this.currentBranch = null;
              this.range.replace([]);
            },
          },
          scheduler
        )
      )
    ) as BranchSubscriber;

    scheduler.notify(branch);
    await scheduler.flushInteraction();

    expect(thenResolved).toBe(false);
    expect(replacements).toEqual([]);
    expect(visible.subs).toContain(branch);
    expect(branch.branch.currentBranch).toBe(BRANCH_THEN);
    expect(branch.branch.currentOwner).toBeNull();
  });

  it('switches resumed mounted branches and disposes the mounted owner', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const visible = createSignal(true);
    const local = createSignal('mounted');
    const text = createText();
    const elseNode = createNode('else');
    const { range, replacements } = createBranchRange();
    let thenResolved = false;
    let elseResolved = false;
    let effect!: DomSubscriber;
    const branch = createOwned(() =>
      registerSubscriberToOwner(
        new BranchSubscription(
          {
            range,
            conditionFn: () => visible.value,
            thenFn: createQRL<BranchRenderFn>('chunk', 'renderThen', null, () => {
              thenResolved = true;
              return Promise.resolve({
                renderThen: () => [],
              });
            }),
            elseFn: createQRL<BranchRenderFn>('chunk', 'renderElse', null, () => {
              elseResolved = true;
              return Promise.resolve({
                renderElse: () => [elseNode],
              });
            }),
            currentBranch: BRANCH_THEN,
            currentOwner: null,
            invokeContext: getActiveInvokeContextOrNull(),
            container: { scheduler } as ContainerContext,
            dispose() {
              this.currentBranch = null;
              this.currentOwner = null;
              this.range.replace([]);
            },
          },
          scheduler
        )
      )
    ) as BranchSubscriber;
    const mountedOwner = createOwner(branch.owner);
    branch.branch.currentOwner = mountedOwner;

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
    expect(effect.owner).toBeNull();
    expect(branch.branch.currentBranch).toBe(BRANCH_ELSE);
    expect(branch.branch.currentOwner).not.toBe(mountedOwner);
  });

  it('restores serialized captures for branch QRLs', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const container = createCaptureContainer({
      0: 'branch',
      1: 'capture',
    });
    const { range, replacements } = createBranchRange();
    const thenQrl = createQRL<BranchRenderFn>(
      'chunk',
      'renderThen',
      null,
      () =>
        Promise.resolve({
          renderThen: () => [createNode((_captures as readonly string[]).join(':'))],
        }),
      '0 1',
      container
    );
    const branch = createOwned(() =>
      createBranch({ scheduler } as ContainerContext, range, () => true, thenQrl)
    );

    scheduler.notify(branch);
    await scheduler.flushInteraction();

    expect(getNodeLabel(replacements[0][0])).toBe('branch:capture');
  });

  it('renders SSR branches from QRLs and registers reactive work', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const visible = createSignal(true);
    const child = createSignal('then');
    const ctx = { scheduler } as ContainerContext;
    const conditionQrl = createQRL<BranchConditionFn>('chunk', 'condition', () => visible.value);
    const thenQrl = createQRL<SsrBranchRenderFn>('chunk', 'renderThen', () => {
      return renderSsrTextNode(createSsrElementTextTarget(11), child);
    });

    const html = await createOwned(() => renderSsrBranch(ctx, 0, conditionQrl, thenQrl, undefined));
    const branch = visible.subs?.[0] as SSRBranchSubscription | undefined;

    expect(html).toBe('then');
    expect(branch).toBeDefined();
    expect(branch!.deps).not.toBeNull();
    expect(branch!.branch.currentBranch).toBe(BRANCH_THEN);
    expect(branch!.branch.currentOwner).not.toBeNull();
    expect(child.subs).not.toBeNull();
  });

  it('resolves async SSR branch QRLs', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const visible = createSignal(false);
    const ctx = { scheduler } as ContainerContext;
    let conditionResolved = false;
    let elseResolved = false;
    const conditionQrl = createQRL<BranchConditionFn>('chunk', 'condition', null, () => {
      conditionResolved = true;
      return Promise.resolve({
        condition: () => visible.value,
      });
    });
    const thenQrl = createQRL<SsrBranchRenderFn>('chunk', 'renderThen', () => 'then');
    const elseQrl = createQRL<SsrBranchRenderFn>('chunk', 'renderElse', null, () => {
      elseResolved = true;
      return Promise.resolve({
        renderElse: () => 'else',
      });
    });

    const html = await createOwned(() => renderSsrBranch(ctx, 1, conditionQrl, thenQrl, elseQrl));

    expect(html).toBe('else');
    expect(conditionResolved).toBe(true);
    expect(elseResolved).toBe(true);
  });
});

function createOwned<T>(run: () => T): T {
  return runWithOwner(createOwner(null), run);
}

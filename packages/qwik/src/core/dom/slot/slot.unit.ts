import { describe, expect, it } from 'vitest';
import {
  createCaptureContainer,
  createText,
  noopSchedule,
  runWithTestContainer,
} from '../../test-utils';
import { useSignal } from '../../reactive/public-api';
import { runWithCollector } from '../../reactive/tracking';
import { invoke, newInvokeContext } from '../../runtime/invoke-context';
import { createOwner } from '../../runtime/owner';
import { Scheduler } from '../../runtime/scheduler';
import { useTask } from '../../runtime/task';
import { createQRL } from '../../shared/qrl/qrl-class';
import type { ValueOrPromise } from '../../shared/utils/types';
import type { ContainerContext } from '../../runtime/container-context';
import type { SsrOutput } from '../../ssr/output';
import {
  createSlot,
  createSlotScope,
  registerProjection,
  renderSsrSlot,
  type SsrSlotContext,
} from './slot';

describe('slots', () => {
  it('returns one CSR projection without copying its nodes', () => {
    const scheduler = new Scheduler(noopSchedule);
    const container = createCaptureContainer({}, scheduler);
    const scope = createSlotScope();
    const nodes = [createText('projected')];
    registerProjection(scope, '', () => nodes);
    const context = newInvokeContext({ owner: createOwner(null), container, slotScope: scope });

    expect(invoke(context, createSlot)).toBe(nodes);
  });

  it('returns one SSR projection without wrapping its output', () => {
    const scheduler = new Scheduler(noopSchedule);
    const container = createCaptureContainer({}, scheduler);
    const scope = createSlotScope();
    const output: SsrOutput = ['projected'];
    registerProjection(scope, '', () => output);
    const context = newInvokeContext({ owner: createOwner(null), container, slotScope: scope });

    expect(invoke(context, () => renderSsrSlot(container))).toBe(output);
  });

  it('does not collect CSR fallback dependencies on the caller', () => {
    const scheduler = new Scheduler(noopSchedule);
    const collector = runWithTestContainer(scheduler, () => useTask(() => {}));
    const source = useSignal('fallback');
    const container = createCaptureContainer({}, scheduler);
    const context = newInvokeContext({
      owner: createOwner(null),
      container,
      slotScope: createSlotScope(),
    });

    const output = runWithCollector(collector, () =>
      invoke(context, () =>
        createSlot('', () => {
          source.value;
          return [];
        })
      )
    );

    expect(output).toEqual([]);
    expect(source.subs).toBeNull();
    expect(collector.deps).toBeNull();
  });

  it('does not collect SSR fallback dependencies on the caller', () => {
    const scheduler = new Scheduler(noopSchedule);
    const collector = runWithTestContainer(scheduler, () => useTask(() => {}));
    const source = useSignal('fallback');
    const container = { nextId: () => 0 } as ContainerContext & { nextId(): number };
    const context = newInvokeContext({
      owner: createOwner(null),
      container,
      slotScope: createSlotScope(),
    });
    const fallback = createQRL<(ctx: SsrSlotContext, rangeId: number) => ValueOrPromise<SsrOutput>>(
      'chunk',
      'fallback',
      () => source.value
    );

    const output = runWithCollector(collector, () =>
      invoke(context, () => renderSsrSlot(container, '', fallback))
    );

    expect(output).toBe('fallback');
    expect(source.subs).toBeNull();
    expect(collector.deps).toBeNull();
  });
});

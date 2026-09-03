import { describe, expect, it } from 'vitest';
import { createCaptureContainer, noopSchedule, runWithTestContainer } from '../../test-utils';
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
import { createSlot, createSlotScope, renderSsrSlot, type SsrSlotContext } from './slot';

describe('slots', () => {
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

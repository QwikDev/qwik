import { describe, expect, it } from 'vitest';
import { createWindow } from '../../../testing/document';
import { createContainerContext } from '../../runtime/container-context';
import { createCaptureContainer, noopSchedule, runWithTestContainer } from '../../test-utils';
import { OwnerFlags } from '../../reactive/flags';
import { useSignal } from '../../reactive/public-api';
import { runWithCollector } from '../../reactive/tracking';
import { invoke, newInvokeContext } from '../../runtime/invoke-context';
import { createOwner, disposeOwner } from '../../runtime/owner';
import { parkProjections, prepareProjectionRanges, replaceRange } from '../range/range';
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
  it.each(['s=bad,0', 's=0,-1', 's=0,1.5', 's=0,9007199254740992'])(
    'rejects malformed projection marker %s',
    async (marker) => {
      const window = createWindow({ html: '<div q:container></div>' });
      const container = createContainerContext(window.document.body.firstElementChild!);
      const owner = createOwner(null);
      owner.flags |= OwnerFlags.ResumeProjection;
      const start = window.document.createComment('b=0');
      const end = window.document.createComment('/b');
      for (const node of [
        start,
        window.document.createComment(marker),
        window.document.createComment('/s'),
        end,
      ]) {
        container.element.appendChild(node);
      }
      await expect(prepareProjectionRanges(container, start, end, owner)).rejects.toThrow(
        'Invalid projection marker'
      );
    }
  );

  it('parks multiple CSR projections in one fragment and releases it after showing', async () => {
    const window = createWindow({ html: '<div q:container></div>' });
    const scheduler = new Scheduler(noopSchedule);
    const container = createContainerContext(window.document.body.firstElementChild!, scheduler);
    const host = createOwner(null);
    const consumer = createOwner(host);
    const scope = createSlotScope();
    const first = window.document.createTextNode('first');
    const second = window.document.createTextNode('second');
    invoke(newInvokeContext({ owner: host, container }), () => {
      registerProjection(scope, 'first', () => [first]);
      registerProjection(scope, 'second', () => [second]);
    });
    const context = newInvokeContext({ owner: consumer, container, slotScope: scope });
    for (const name of ['first', 'second']) {
      for (const node of await invoke(context, () => createSlot(name))) {
        container.element.appendChild(node);
      }
    }
    await scheduler.flushInteraction();
    expect(Array.isArray(consumer.shownProjections)).toBe(true);
    parkProjections(consumer);
    const detached = container.state.detachedProjectionNodes!;
    expect(first.parentNode).toBe(detached);
    expect(second.parentNode).toBe(detached);
    expect(consumer.shownProjections).toBeUndefined();
    for (const name of ['first', 'second']) {
      for (const node of await invoke(context, () => createSlot(name))) {
        container.element.appendChild(node);
      }
    }
    expect(container.element.textContent).toBe('firstsecond');
    expect(container.state.detachedProjectionNodes).toBeUndefined();
    expect(first.parentNode).toBe(container.element);
    expect(second.parentNode).toBe(container.element);
    disposeOwner(host);
  });

  it('retains only projected DOM and releases it with its declaring scope', async () => {
    const window = createWindow({ html: '<div q:container></div>' });
    const scheduler = new Scheduler(noopSchedule);
    const container = createContainerContext(window.document.body.firstElementChild!, scheduler);
    const host = createOwner(null);
    const consumer = createOwner(host);
    const scope = createSlotScope();
    const text = window.document.createTextNode('projected');
    let cleanups = 0;
    const projection = invoke(newInvokeContext({ owner: host, container }), () =>
      registerProjection(scope, '', () => {
        useTask(({ cleanup }) =>
          cleanup(() => {
            cleanups++;
          })
        );
        return [text];
      })
    );
    const start = window.document.createComment('b=0');
    const end = window.document.createComment('/b');
    container.element.appendChild(start);
    for (const node of await invoke(
      newInvokeContext({ owner: consumer, container, slotScope: scope }),
      createSlot
    )) {
      container.element.appendChild(node);
    }
    for (let i = 0; i < 10000; i++) {
      container.element.appendChild(window.document.createElement('div'));
    }
    container.element.appendChild(end);
    await scheduler.flushInteraction();
    parkProjections(consumer);
    replaceRange(window.document, start, end, []);
    disposeOwner(consumer);
    const block = (projection.subscription as import('./slot').ProjectionSubscription).block;
    expect(block.start.parentNode!.childNodes.length).toBe(3);
    expect(container.element.childNodes.length).toBe(2);
    expect(cleanups).toBe(0);
    disposeOwner(host);
    disposeOwner(host);
    expect(cleanups).toBe(1);
    expect(container.state.detachedProjectionNodes).toBeUndefined();
    expect(text.parentNode).toBeNull();
  });
  it('keeps the projected nodes when taking the live range again', async () => {
    const window = createWindow({ html: '<div q:container></div>' });
    const scheduler = new Scheduler(noopSchedule);
    const container = createContainerContext(window.document.body.firstElementChild!, scheduler);
    const scope = createSlotScope();
    const text = window.document.createTextNode('projected');
    const owner = createOwner(null);
    invoke(newInvokeContext({ owner, container }), () =>
      registerProjection(scope, '', () => [text])
    );
    const context = newInvokeContext({ owner, container, slotScope: scope });
    const nodes = await invoke(context, createSlot);
    for (const node of nodes) {
      container.element.appendChild(node);
    }
    await scheduler.flushInteraction();
    expect(container.element.textContent).toBe('projected');
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    container.state.inflatingRoots = new WeakMap([[scope.projections[0].subscription!, pending]]);
    let ready = false;
    const taking = Promise.resolve(invoke(context, createSlot)).then((nodes) => {
      ready = true;
      return nodes;
    });
    await Promise.resolve();
    expect(ready).toBe(false);
    release();
    const moved = await taking;
    for (const node of moved) {
      container.element.appendChild(node);
    }
    expect(text.parentNode).toBe(container.element);
  });

  it('updates the render parent without changing the declaring owner', async () => {
    const window = createWindow({ html: '<div q:container></div>' });
    const scheduler = new Scheduler(noopSchedule);
    const container = createContainerContext(window.document.body.firstElementChild!, scheduler);
    const scope = createSlotScope();
    const host = createOwner(null);
    const text = window.document.createTextNode('projected');
    const projection = invoke(newInvokeContext({ owner: host, container }), () =>
      registerProjection(scope, '', () => [text])
    );
    const firstHost = createOwner(host);
    const secondHost = createOwner(host);
    const first = newInvokeContext({ owner: firstHost, container, slotScope: scope });
    const second = newInvokeContext({ owner: secondHost, container, slotScope: scope });
    for (const node of await invoke(first, createSlot)) {
      container.element.appendChild(node);
    }
    await scheduler.flushInteraction();
    const subscription = projection.subscription! as import('./slot').ProjectionSubscription;
    const owner = subscription.block.currentOwner!;
    expect(owner.parent).toBe(host);
    expect(owner.renderParent).toBe(firstHost);
    expect(firstHost.shownProjections).toBe(subscription.block);
    expect(owner.projection).toBe(subscription.block);
    for (const node of await invoke(second, createSlot)) {
      container.element.appendChild(node);
    }
    expect(owner.parent).toBe(host);
    expect(owner.renderParent).toBe(secondHost);
    expect(firstHost.shownProjections).toBeUndefined();
    expect(secondHost.shownProjections).toBe(subscription.block);
    expect(text.parentNode).toBe(container.element);
  });

  it('wraps SSR projection output in a resumable range', () => {
    const scheduler = new Scheduler(noopSchedule);
    const container = createCaptureContainer({}, scheduler);
    const scope = createSlotScope();
    const output: SsrOutput = ['projected'];
    registerProjection(scope, '', (_ctx: unknown, rangeId: number, rootId: number) => [
      '<!s=',
      { type: 'node-id', localId: rangeId },
      ',',
      { type: 'root-ref', localId: rootId },
      '>',
      ...output,
      '<!/s>',
    ]);
    const context = newInvokeContext({ owner: createOwner(null), container, slotScope: scope });

    expect(invoke(context, () => renderSsrSlot(container))).toEqual([
      '<!s=',
      { type: 'node-id', localId: 0 },
      ',',
      { type: 'root-ref', localId: 0 },
      '>',
      ...output,
      '<!/s>',
    ]);
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
    const container = {
      nextId: () => 0,
      addRoot: () => 0,
    } as unknown as ContainerContext & SsrSlotContext;
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

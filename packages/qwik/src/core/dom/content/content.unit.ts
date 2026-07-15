import { describe, expect, it } from 'vitest';
import { createDocument } from '../../../testing/document';
import { disposeSubscriber } from '../../reactive/cleanup';
import { useSignal } from '../../reactive/public-api';
import type { ContainerContext } from '../../runtime/container-context';
import { invoke, newInvokeContext } from '../../runtime/invoke-context';
import { createOwner } from '../../runtime/owner';
import { Scheduler } from '../../runtime/scheduler';
import { createTextNodeEffect } from '../effect/effect';
import { createContentBlock } from './content';

describe('ContentBlock', () => {
  it('renders initially and replaces content when a dependency changes', async () => {
    const value = useSignal('first');
    const { content, host } = setup([value], (document, _scheduler, signal) =>
      text(document, signal.value)
    );

    content.run();
    expect(host.textContent).toBe('first');

    value.value = 'second';
    await content.scheduler.flushInteraction();

    expect(host.textContent).toBe('second');
  });

  it('keeps the old DOM while a returned promise is pending', async () => {
    const value = useSignal('initial');
    const next = deferred<Node>();
    const { content, host } = setup([value], (document, _scheduler, signal) =>
      signal.value === 'initial' ? text(document, 'initial') : next.promise
    );

    content.run();
    value.value = 'pending';
    const pending = content.scheduler.flushInteraction();

    expect(host.textContent).toBe('initial');

    next.resolve(text(host.ownerDocument, 'ready'));
    await pending;

    expect(host.textContent).toBe('ready');
  });

  it('processes async updates sequentially', async () => {
    const value = useSignal(0);
    const first = deferred<Node>();
    const second = deferred<Node>();
    const started = deferred<void>();
    const calls: number[] = [];
    const { content, host } = setup([value], (document, _scheduler, signal) => {
      calls.push(signal.value);
      if (signal.value === 0) {
        return text(document, 'initial');
      }
      if (signal.value === 1) {
        started.resolve();
      }
      return signal.value === 1 ? first.promise : second.promise;
    });

    content.run();
    value.value = 1;
    const pending = content.scheduler.flushInteraction();
    await started.promise;
    value.value = 2;
    expect(host.textContent).toBe('initial');
    expect(calls).toEqual([0, 1]);

    first.resolve(text(host.ownerDocument, 'first'));
    second.resolve(text(host.ownerDocument, 'current'));
    await pending;
    expect(calls).toEqual([0, 1, 2]);
    expect(host.textContent).toBe('current');
  });

  it('keeps the previous DOM when the current attempt rejects', async () => {
    const value = useSignal(false);
    const next = deferred<Node>();
    const { content, host } = setup([value], (document, _scheduler, signal) =>
      signal.value ? next.promise : text(document, 'current')
    );

    content.run();
    value.value = true;
    const pending = content.run();
    const error = new Error('content failed');
    next.reject(error);

    await expect(pending).rejects.toBe(error);
    expect(host.textContent).toBe('current');
  });

  it('blocks a late async commit after disposal', async () => {
    const value = useSignal(false);
    const nested = useSignal('nested');
    const next = deferred<Node>();
    let attemptEffect: ReturnType<typeof createTextNodeEffect> | undefined;
    const { content, host } = setup([value], (document, scheduler, signal) => {
      if (signal.value) {
        attemptEffect = createTextNodeEffect(document.createTextNode(''), nested, scheduler);
        return next.promise;
      }
      return text(document, 'current');
    });

    content.run();
    value.value = true;
    const pending = content.run();
    disposeSubscriber(content);
    expect(attemptEffect?.owner).toBeNull();
    next.resolve(text(host.ownerDocument, 'late'));

    await pending;
    await Promise.resolve();
    expect(host.textContent).toBe('');
  });

  it('disposes nested effects with replaced content', async () => {
    const version = useSignal(0);
    const nested = useSignal('nested');
    const effects: ReturnType<typeof createTextNodeEffect>[] = [];
    const { content } = setup([version], (document, scheduler, signal) => {
      signal.value;
      const effect = createTextNodeEffect(document.createTextNode(''), nested, scheduler);
      effects.push(effect);
      scheduler.notify(effect);
      return text(document, `content-${signal.value}`);
    });

    content.run();
    await content.scheduler.flushInteraction();
    expect(nested.subs).toContain(effects[0]);

    version.value = 1;
    await content.scheduler.flushInteraction();

    expect(effects[0].owner).toBeNull();
    expect(nested.subs).not.toContain(effects[0]);
    expect(nested.subs).toContain(effects[1]);
  });
});

function setup<TArgs extends unknown[]>(
  args: TArgs,
  fn: (
    document: Document,
    scheduler: Scheduler,
    ...args: TArgs
  ) => Node | readonly Node[] | null | undefined | Promise<Node>
) {
  const document = createDocument({ html: '<div></div>' });
  const host = document.querySelector('div')!;
  const start = document.createComment('start');
  const end = document.createComment('end');
  host.appendChild(start);
  host.appendChild(end);
  const scheduler = new Scheduler(() => {});
  const ctx = { document, scheduler } as ContainerContext;
  const context = newInvokeContext({ owner: createOwner(null), container: ctx });
  const content = invoke(context, () =>
    createContentBlock(ctx, start, end, args, (...args) => fn(document, scheduler, ...args))
  );
  return { content, host };
}

function text(document: Document, value: string): Node {
  return document.createTextNode(value);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

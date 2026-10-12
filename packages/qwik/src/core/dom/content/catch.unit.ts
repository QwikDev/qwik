import { describe, expect, it } from 'vitest';
import { createDocument } from '../../../testing/document';
import { OwnerFlags } from '../../reactive/flags';
import { useSignal } from '../../reactive/public-api';
import { createQRL } from '../../shared/qrl/qrl-class';
import { createContainerContext } from '../../runtime/container-context';
import { invoke, newInvokeContext } from '../../runtime/invoke-context';
import { createOwner } from '../../runtime/owner';
import { Scheduler } from '../../runtime/scheduler';
import { BranchRange } from '../branch/branch';
import { createTextNodeEffect } from '../effect/text-effect';
import { createCatch, createSsrCatch, CatchContentSubscription } from './catch';
import type { ContentFn } from './content';
import type { SsrRangeScope } from './pending-ssr';
import { allocate } from '../../shared/serdes/allocate';
import { inflate } from '../../shared/serdes/inflate';
import { TypeIds } from '../../shared/serdes/type-id';
import { EffectKind } from '../effect/effect-kind.enum';

function setup(
  content: ContentFn,
  fallback = createQRL<ContentFn>('chunk', 'fallback', (_ctx, error) => (error as Error).message)
) {
  const document = createDocument({ html: '<div></div>' });
  const host = document.querySelector('div')!;
  const start = document.createComment('start');
  const end = document.createComment('end');
  host.appendChild(start);
  host.appendChild(end);
  const scheduler = new Scheduler(() => {});
  const ctx = createContainerContext(host, scheduler);
  const boundary = invoke(newInvokeContext({ owner: createOwner(null), container: ctx }), () =>
    createCatch(
      ctx,
      new BranchRange(document, start, end),
      createQRL('chunk', 'content', content),
      fallback
    )
  );
  return { boundary, host, ctx, scheduler };
}

describe('Catch content', () => {
  it.each([null, undefined, 'raw throw'])('wraps a non-Error throw: %s', (error) => {
    const { boundary, host } = setup(() => {
      throw error;
    });
    expect(boundary.error).toBeInstanceOf(Error);
    expect(host.textContent).toBe(String(error));
  });

  it('disposes the broken subtree and ignores a late render result', async () => {
    let resolve!: (value: Node) => void;
    const pending = new Promise<Node>((done) => {
      resolve = done;
    });
    const { boundary, host, scheduler } = setup(() => pending);
    await boundary.catchError(new Error('failed'));
    resolve(host.ownerDocument.createTextNode('late content'));
    await scheduler.flushInteraction();
    expect(host.textContent).toBe('failed');
  });

  it('removes child subscriptions when a scalar effect fails', async () => {
    const value = useSignal('initial');
    const { boundary, host, scheduler } = setup((ctx: any) => {
      const node = ctx.document.createTextNode('');
      const effect = createTextNodeEffect(node, value, ctx.scheduler);
      ctx.scheduler.notify(effect);
      return node;
    });
    await scheduler.flushInteraction();
    const contentOwner = boundary.block.currentOwner!;
    await boundary.catchError(new Error('failed'));
    expect(contentOwner.flags & OwnerFlags.Disposed).toBeTruthy();
    value.value = 'updated';
    await scheduler.flushInteraction();
    expect(host.textContent).toBe('failed');
  });
});

describe('buffered SSR Catch', () => {
  it('settles nested output before committing and disables nested deferral', async () => {
    let scope!: SsrRangeScope;
    let reject!: (error: unknown) => void;
    const pending = new Promise<string>((_done, fail) => {
      reject = fail;
    });
    let caught = false;
    const host = {
      canDefer: true,
      nextId: () => 1,
      addRoot: () => 0,
      wrapRange: (_id: number, output: any) => output,
      markCaughtError: () => {
        caught = true;
      },
      createRangeScope: () => {
        scope = Object.assign(Object.create(host), {
          flush: () => {},
          defer: () => {},
          reparentRanges: () => {},
        });
        return scope;
      },
    };
    const output = invoke(newInvokeContext({ owner: createOwner(null) }), () =>
      createSsrCatch(
        host,
        0,
        createQRL('chunk', 'content', () => ['partial', pending]),
        createQRL('chunk', 'fallback', (_ctx, error) => (error as Error).message)
      )
    );
    expect(scope.canDefer).toBe(false);
    expect(host.canDefer).toBe(true);
    expect(output).toBeInstanceOf(Promise);
    reject(new Error('async failed'));
    expect(await output).toBe('async failed');
    expect(caught).toBe(true);
  });
});

it.each([null, ['not a QRL', null], [null, new Error('invalid')]])(
  'rejects malformed serialized Catch state: %s',
  async (state) => {
    const document = createDocument({ html: '<div><!--d=0--><!--/d--></div>' });
    const ctx = createContainerContext(document.querySelector('div')!);
    const hostOwner = createOwner(null);
    const contentOwner = createOwner(hostOwner);
    const render = createQRL('chunk', 'render', () => '');
    const subscription = allocate(ctx, TypeIds.CatchSubscription, [
      TypeIds.Plain,
      EffectKind.Content,
    ]) as CatchContentSubscription;
    const parts = [EffectKind.Content, 0, [], [], render, contentOwner, null, null, true, state];
    const payload = [
      ...parts.flatMap((value) => [TypeIds.Plain, value]),
      TypeIds.Plain,
      hostOwner,
      TypeIds.Plain,
      0,
    ];
    await expect(
      Promise.resolve().then(() => inflate(ctx, subscription, TypeIds.CatchSubscription, payload))
    ).rejects.toThrow('Invalid serialized Catch state');
  }
);

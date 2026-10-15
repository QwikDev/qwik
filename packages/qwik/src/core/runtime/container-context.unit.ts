import { ComputedQrl } from '../reactive/computed-qrl';
import { ComputedFlags } from '../reactive/flags';
import { CatchContentSubscription, SSRCatchContentSubscription } from '../dom/content/catch';
import { findCatchBoundary, registerCatchBoundary } from '../dom/content/catch-boundary';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '../../testing/document';
import { Constants, TypeIds } from '../shared/serdes/constants';
import { QContainerAttr } from '../shared/utils/markers';
import { createContainerContext, getContextScopeForNode } from './container-context';
import { createContextScope, isContextScope } from './context-scope';
import { EffectKind } from '../dom/effect/effect-kind.enum';
import { isLazySerialized } from '../reactive/lazy-serialized';
import { SubscriberFlags } from '../reactive/flags';
import { appendSourceSubscriber, type Source } from '../reactive/source';
import { createSerializationContext } from '../shared/serdes/serialization-context';
import { createQRL } from '../shared/qrl/qrl-class';
import { _regSymbol } from '../shared/qrl/qrl';
import {
  ContentSubscription,
  SSRContent,
  SSRContentSubscription,
  SSRPendingContentSubscription,
  PendingContentSubscription,
} from '../dom/content/content';
import { findPendingBoundary, registerPendingBoundary } from '../dom/content/pending-boundary';
import { useSignal } from '../reactive/public-api';
import { useStore } from '../reactive/store';
import {
  createOwner,
  registerSubscriberToOwner,
  runWithOwner,
  disposeOwner,
  type Owner,
} from './owner';
import { renderSsrTextNode } from '../dom/effect/ssr-effect';
import { SubscriberKind, type Subscriber } from './subscriber';
import { Phase, Scheduler } from './scheduler';
import { Task, TaskSubscription } from './task';
import type { Signal } from '../reactive/signal';
import { toArray } from '../test-utils';
import { ProjectionBlock } from '../dom/slot/slot';
import { newInvokeContext } from './invoke-context';

describe('ContainerContext', () => {
  beforeEach(() => {
    _regSymbol(CatchContentSubscription, 'Catch');
  });

  it.each(['returned', 'thrown', 'nested', 'qrl'] as const)(
    'ignores disposed SSRContent after a %s Promise settles',
    async (kind) => {
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const body = vi.fn(() => {
        if (kind === 'thrown') {
          throw pending;
        }
        if (kind === 'nested') {
          return ['before', pending.then(() => 'late'), 'after'];
        }
        return pending.then(() => 'late');
      });
      const qrl =
        kind === 'qrl'
          ? createQRL<typeof body>('lazy', 'body', null, () => pending.then(() => ({ body })))
          : createQRL('', 'body', body);
      const content = new SSRContent(0, [], qrl, null);
      const owner = createOwner(null);
      const writing = runWithOwner(owner, () => content.run());
      content.dispose();
      const initialCalls = body.mock.calls.length;
      release();
      expect(await writing).toBe('');
      await pending;
      await Promise.resolve();
      expect(body).toHaveBeenCalledTimes(initialCalls);
      expect(content.currentOwner).toBeNull();
      disposeOwner(owner);
    }
  );

  it('skips a content body disposed before synchronous rendering', () => {
    const body = vi.fn(() => 'late');
    const owner = createOwner(null);
    const content = new SSRContent(0, [], createQRL('', 'body', body), null);
    expect(runWithOwner(owner, () => content.run(() => content.dispose()))).toBe('');
    expect(body).not.toHaveBeenCalled();
    disposeOwner(owner);
  });

  it('renders SSRContent synchronously', () => {
    const content = new SSRContent(
      0,
      [],
      createQRL('', 'sync-content', () => ['first', ['second', 'third']]),
      null
    );
    expect(runWithOwner(createOwner(null), () => content.run())).toEqual([
      'first',
      ['second', 'third'],
    ]);
    content.dispose();
  });

  it.each(['object', 'qrl', 'signal', 'store', 'promise'] as const)(
    'preserves shared %s identity before and after reading the parent',
    async (kind) => {
      for (let readOrder = 0; readOrder < 2; readOrder++) {
        const readParentFirst = readOrder === 1;
        const shared =
          kind === 'qrl'
            ? createQRL('chunk', 'shared', () => 1)
            : kind === 'signal'
              ? runWithOwner(createOwner(null), () => useSignal(1))
              : kind === 'store'
                ? useStore({ value: 1 })
                : kind === 'promise'
                  ? Promise.resolve({ value: 1 })
                  : { value: 1 };
        const serialization = createSerializationContext(
          null,
          () => '',
          () => {},
          new WeakMap()
        );
        serialization.$addRoot$({ shared });
        await serialization.$serialize$();
        const container = createContainer(
          `<script type="qwik/state" q:base="0" q:len="${serialization.$rootStateRootCount$}">${serialization.$writer$.toString()}</script>`
        );
        const context = createContainerContext(container);
        const parent = readParentFirst
          ? ((await context.getRoot(0)) as { shared: unknown })
          : undefined;
        const id = serialization.$addRoot$(shared);
        const packet = await serialization.$serializeNext$();
        if (packet !== null) {
          context.registerStateScripts!([
            appendStateScript(container, packet.base, JSON.parse(packet.state), packet.len),
          ]);
        }
        const restoredParent = parent ?? ((await context.getRoot(0)) as { shared: unknown });
        expect(await context.getRoot(id)).toBe(await restoredParent.shared);
      }
    }
  );

  it.each(['object', 'qrl'] as const)(
    'reuses a promoted %s during allocation and inflation',
    async (kind) => {
      const qrl = createQRL('chunk', 'shared', () => 1);
      const shared = kind === 'qrl' ? qrl : { qrl };
      const serialization = createSerializationContext(
        null,
        () => '',
        () => {},
        new WeakMap()
      );
      serialization.$addRoot$({ shared });
      await serialization.$serialize$();
      const container = createContainer(
        `<script type="qwik/state" q:base="0" q:len="${serialization.$rootStateRootCount$}">${serialization.$writer$.toString()}</script>`
      );
      const context = createContainerContext(container);
      const getRoot = context.getRoot;
      const chunkId = serialization.$hasRootId$('chunk')!;
      let release!: () => void;
      let started!: () => void;
      const blocked = new Promise<void>((done) => {
        release = done;
      });
      const allocating = new Promise<void>((done) => {
        started = done;
      });
      context.getRoot = (id) => {
        if (id === chunkId) {
          started();
          return blocked.then(() => getRoot(id));
        }
        return getRoot(id);
      };
      const readingParent = getRoot(0);
      await allocating;
      const id = serialization.$addRoot$(shared);
      const packet = (await serialization.$serializeNext$())!;
      context.registerStateScripts!([
        appendStateScript(container, packet.base, JSON.parse(packet.state), packet.len),
      ]);
      const readingShared = getRoot(id);
      release();
      const parent = (await readingParent) as { shared: unknown };
      expect(await readingShared).toBe(parent.shared);
    }
  );

  it('disposes a retired shell root encoded as undefined', async () => {
    const container = createContainer(
      `<script type="qwik/state" q:base="0" q:len="1">[${TypeIds.Constant},${Constants.Undefined}]</script>`
    );
    const context = createContainerContext(container);
    context.discardRoot(0);
    await expect(context.disposeRoot(0)).resolves.toBeUndefined();
    expect(await context.getRoot(0)).toBeUndefined();
  });

  it('retires an unopened root without reading or resuming it', async () => {
    const context = createContainerContext(createContainer(''));
    const read = vi.spyOn(context, 'getRoot');
    await context.disposeRoot(7);
    expect(read).not.toHaveBeenCalled();
    expect(context.state.disposedRoots.has(7)).toBe(true);
  });

  it('reuses an inline cached value of an already resumed computed', async () => {
    const serialization = createSerializationContext(
      null,
      () => '',
      () => {},
      new WeakMap()
    );
    const shared = { value: 1 };
    const computed = registerSubscriberToOwner(
      new ComputedQrl(createQRL('chunk', 'compute', () => shared)),
      createOwner(null)
    );
    computed.v = shared;
    computed.flags = ComputedFlags.HasValue;
    serialization.$addRoot$(computed);
    await serialization.$serialize$();
    const container = createContainer(
      `<script type="qwik/state" q:base="0" q:len="${serialization.$rootStateRootCount$}">${serialization.$writer$.toString()}</script>`
    );
    const context = createContainerContext(container);
    const parent = (await context.getRoot(0)) as ComputedQrl<typeof shared>;
    const id = serialization.$addRoot$(shared);
    const packet = (await serialization.$serializeNext$())!;
    context.registerStateScripts!([
      appendStateScript(container, packet.base, JSON.parse(packet.state), packet.len),
    ]);
    expect(await context.getRoot(id)).toBe(parent.v);
  });

  it('keeps a promoted object identical after its parent resumed', async () => {
    const serialization = createSerializationContext(
      null,
      () => '',
      () => {},
      new WeakMap()
    );
    const shared = { value: 1 };
    serialization.$addRoot$({ shared });
    await serialization.$serialize$();
    const container = createContainer(
      `<script type="qwik/state" q:base="0" q:len="1">${serialization.$writer$.toString()}</script>`
    );
    const context = createContainerContext(container);
    const parent = (await context.getRoot(0)) as { shared: typeof shared };
    const id = serialization.$addRoot$(shared);
    const packet = (await serialization.$serializeNext$())!;
    context.registerStateScripts!([
      appendStateScript(container, packet.base, JSON.parse(packet.state), packet.len),
    ]);
    expect(await context.getRoot(id)).toBe(parent.shared);
  });

  it('limits saved ancestor contexts to their detached projection range', async () => {
    const container = createContainer('');
    const context = createContainerContext(container);
    const fragment = container.ownerDocument.createDocumentFragment();
    const start = container.ownerDocument.createComment('s=0,0');
    const button = container.ownerDocument.createElement('button');
    const end = container.ownerDocument.createComment('/s');
    const outside = container.ownerDocument.createElement('span');
    for (const node of [start, button, end, outside]) {
      fragment.appendChild(node);
    }
    const scope = createContextScope(null);
    const owner = createOwner(null);
    owner.projection = new ProjectionBlock(
      container.ownerDocument,
      start,
      end,
      [],
      () => [],
      newInvokeContext({ container: context, contextScope: scope }),
      context
    );
    context.state.detachedProjectionNodes = fragment;
    expect(await getContextScopeForNode(context, button, owner)).toBe(scope);
    expect(await getContextScopeForNode(context, outside)).toBeNull();
  });

  it('restores a suspense boundary before its lazy child root', async () => {
    const qrl = createQRL('chunk', 'render', () => '');
    const hostOwner = createOwner(null);
    const boundaryContent = new SSRContent(0, [], qrl, null);
    const boundary = registerSubscriberToOwner(
      new SSRPendingContentSubscription(boundaryContent, null, 0),
      hostOwner
    );
    const contentOwner = createOwner(hostOwner);
    boundaryContent.currentOwner = contentOwner;
    registerPendingBoundary(contentOwner, boundary);
    const child = registerSubscriberToOwner(
      new SSRContentSubscription(new SSRContent(1, [], qrl, null)),
      contentOwner
    );
    const serialization = createSerializationContext(
      null,
      () => '',
      () => {},
      new WeakMap()
    );
    const childId = serialization.$addRoot$(child);
    const boundaryId = serialization.$addRoot$(boundary);
    await serialization.$serialize$();
    const state = serialization.$writer$.toString();
    const encoded = JSON.parse(state) as unknown[];
    expect(encoded[childId * 2]).toBe(TypeIds.EffectSubscription);
    expect(encoded[boundaryId * 2]).toBe(TypeIds.PendingSubscription);
    const container = createContainer(`
      <!--d=0--><!--d=1--><!--/d--><!--/d-->
      <script type="qwik/state" q:base="0" q:len="${serialization.$roots$.length}">${state}</script>
    `);
    const context = createContainerContext(container);

    expect(childId).not.toBe(boundaryId);
    expect(context.state.liveRoots.has(boundaryId)).toBe(false);
    const restoredChild = (await context.getRoot(childId)) as Subscriber;
    expect(restoredChild).toBeInstanceOf(ContentSubscription);
    expect(restoredChild).not.toBeInstanceOf(PendingContentSubscription);
    expect(context.state.liveRoots.has(boundaryId)).toBe(true);
    const restoredBoundary = context.state.liveRoots.get(boundaryId);
    expect(restoredBoundary).toBeInstanceOf(PendingContentSubscription);
    expect(findPendingBoundary(restoredChild.owner)).toBe(restoredBoundary);
  });

  it.each(['text', 'task'] as const)(
    'restores a suspense boundary before its lazy %s subscriber',
    async (kind) => {
      const qrl = createQRL('chunk', 'render', () => '');
      const hostOwner = createOwner(null);
      const boundaryContent = new SSRContent(0, [], qrl, null);
      const boundary = registerSubscriberToOwner(
        new SSRPendingContentSubscription(boundaryContent, null, 0),
        hostOwner
      );
      const contentOwner = createOwner(hostOwner);
      boundaryContent.currentOwner = contentOwner;
      registerPendingBoundary(contentOwner, boundary);
      const signal = runWithOwner(contentOwner, () => useSignal('ready'));
      let child: Subscriber;
      if (kind === 'text') {
        runWithOwner(contentOwner, () => renderSsrTextNode(1, null, signal));
        child = toArray(signal.subs)[0] as Subscriber;
      } else {
        child = registerSubscriberToOwner(
          new TaskSubscription(new Task(undefined, Phase.BlockingTask, qrl)),
          contentOwner
        );
      }
      const serialization = createSerializationContext(
        null,
        () => '',
        () => {},
        new WeakMap()
      );
      const childId = serialization.$addRoot$(child);
      const boundaryId = serialization.$addRoot$(boundary);
      await serialization.$serialize$();
      const container = createContainer(`
        <!--d=0--><p q:id="1">ready</p><!--/d-->
        <script type="qwik/state" q:base="0" q:len="${serialization.$roots$.length}">${serialization.$writer$.toString()}</script>
      `);
      const context = createContainerContext(container);

      expect(context.state.liveRoots.has(boundaryId)).toBe(false);
      const restoredChild = (await context.getRoot(childId)) as Subscriber;
      expect(context.state.liveRoots.has(boundaryId)).toBe(true);
      expect(findPendingBoundary(restoredChild.owner)).toBe(
        context.state.liveRoots.get(boundaryId)
      );
    }
  );

  it('restores a Catch boundary before its lazy child root', async () => {
    const qrl = createQRL('chunk', 'render', () => '');
    const hostOwner = createOwner(null);
    const boundaryContent = new SSRContent(0, [], qrl, null);
    const boundary = registerSubscriberToOwner(
      new SSRCatchContentSubscription(
        boundaryContent,
        createQRL('chunk', 'fallback', () => 'failed')
      ),
      hostOwner
    );
    const contentOwner = createOwner(hostOwner);
    boundaryContent.currentOwner = contentOwner;
    registerCatchBoundary(contentOwner, boundary);
    const child = registerSubscriberToOwner(
      new SSRContentSubscription(new SSRContent(1, [], qrl, null)),
      contentOwner
    );
    const serialization = createSerializationContext(
      null,
      () => '',
      () => {},
      new WeakMap()
    );
    const childId = serialization.$addRoot$(child);
    const boundaryId = serialization.$addRoot$(boundary);
    await serialization.$serialize$();
    const state = serialization.$writer$.toString();
    const encoded = JSON.parse(state) as unknown[];
    expect(encoded[childId * 2]).toBe(TypeIds.EffectSubscription);
    expect(encoded[boundaryId * 2]).toBe(TypeIds.CatchSubscription);
    const container = createContainer(`
      <!--d=0--><!--d=1--><!--/d--><!--/d-->
      <script type="qwik/state" q:base="0" q:len="${serialization.$roots$.length}">${state}</script>
    `);
    const context = createContainerContext(container);

    expect(childId).not.toBe(boundaryId);
    expect(context.state.liveRoots.has(boundaryId)).toBe(false);
    const restoredChild = (await context.getRoot(childId)) as Subscriber;
    expect(restoredChild).toBeInstanceOf(ContentSubscription);
    expect(restoredChild).not.toBeInstanceOf(CatchContentSubscription);
    expect(context.state.liveRoots.has(boundaryId)).toBe(true);
    const restoredBoundary = context.state.liveRoots.get(boundaryId);
    expect(restoredBoundary).toBeInstanceOf(CatchContentSubscription);
    expect(findCatchBoundary(restoredChild.owner)).toBe(restoredBoundary);
  });

  it.each(['text', 'task'] as const)(
    'restores a Catch boundary before its lazy %s subscriber',
    async (kind) => {
      const qrl = createQRL('chunk', 'render', () => '');
      const hostOwner = createOwner(null);
      const boundaryContent = new SSRContent(0, [], qrl, null);
      const boundary = registerSubscriberToOwner(
        new SSRCatchContentSubscription(
          boundaryContent,
          createQRL('chunk', 'fallback', () => 'failed')
        ),
        hostOwner
      );
      const contentOwner = createOwner(hostOwner);
      boundaryContent.currentOwner = contentOwner;
      registerCatchBoundary(contentOwner, boundary);
      const signal = runWithOwner(contentOwner, () => useSignal('ready'));
      let child: Subscriber;
      if (kind === 'text') {
        runWithOwner(contentOwner, () => renderSsrTextNode(1, null, signal));
        child = toArray(signal.subs)[0] as Subscriber;
      } else {
        child = registerSubscriberToOwner(
          new TaskSubscription(new Task(undefined, Phase.BlockingTask, qrl)),
          contentOwner
        );
      }
      const serialization = createSerializationContext(
        null,
        () => '',
        () => {},
        new WeakMap()
      );
      const childId = serialization.$addRoot$(child);
      const boundaryId = serialization.$addRoot$(boundary);
      await serialization.$serialize$();
      const container = createContainer(`
        <!--d=0--><p q:id="1">ready</p><!--/d-->
        <script type="qwik/state" q:base="0" q:len="${serialization.$roots$.length}">${serialization.$writer$.toString()}</script>
      `);
      const context = createContainerContext(container);

      expect(context.state.liveRoots.has(boundaryId)).toBe(false);
      const restoredChild = (await context.getRoot(childId)) as Subscriber;
      expect(context.state.liveRoots.has(boundaryId)).toBe(true);
      expect(findCatchBoundary(restoredChild.owner)).toBe(context.state.liveRoots.get(boundaryId));
    }
  );

  it('preserves owner order after rollback leaves gaps in cached positions', async () => {
    const serialization = createSerializationContext(
      null,
      () => '',
      () => {},
      new WeakMap()
    );
    const parent = createOwner(null);
    const discarded = createOwner(parent);
    const earlier = createOwner(parent);
    const transaction = serialization.$beginTransaction$();
    serialization.$addRoot$(discarded);
    await serialization.$serializeNext$();
    transaction.rollback();
    disposeOwner(discarded);
    const later = createOwner(parent);
    const laterId = serialization.$addRoot$(later);
    const earlierId = serialization.$addRoot$(earlier);
    const parentId = serialization.$addRoot$(parent);
    const packet = (await serialization.$serializeNext$())!;
    const container = createContainer('');
    appendStateScript(container, packet.base, JSON.parse(packet.state), packet.len);
    const context = createContainerContext(container);
    const restoredLater = await context.getRoot(laterId);
    const restoredEarlier = await context.getRoot(earlierId);
    const restoredParent = (await context.getRoot(parentId)) as Owner;
    expect(toArray(restoredParent.items)).toEqual([restoredEarlier, restoredLater]);
  });

  it('adds request data only when provided', () => {
    const withoutData = createContainerContext(createContainer(''));
    const serverData = { value: 'request-value' };
    const withData = createContainerContext(createContainer(''), undefined, serverData);

    expect(Object.prototype.hasOwnProperty.call(withoutData, 'serverData')).toBe(false);
    expect(withData.serverData).toBe(serverData);
  });

  it('registers state chunk ranges without eagerly parsing script bodies', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">[${TypeIds.Plain},"unused"]</script>
      <script type="qwik/state" q:base="1" q:len="2">
        [${TypeIds.Plain},"one",${TypeIds.Plain},"two"]
      </script>
    `);
    const context = createContainerContext(container);

    expect(context.state.rootToChunk[0].parsed).toBeNull();
    expect(await context.getRoot(2)).toBe('two');
    expect(await context.restoreCaptures('1 1')).toEqual(['one', 'two']);
    expect(await context.restoreCaptures('0#1#0 1')).toEqual(['one', 'two']);
  });

  it('registers an appended state script once and resolves cross-chunk refs', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">
        [${TypeIds.Object},[${TypeIds.Plain},"later",${TypeIds.RootRef},1]]
      </script>
    `);
    const context = createContainerContext(container);
    const script = appendStateScript(container, 1, [TypeIds.Plain, 'value']);

    context.registerStateScripts!([script]);
    context.registerStateScripts!([script]);

    expect(await context.getRoot(0)).toEqual({ later: 'value' });
  });

  it('registers state scripts only for their nearest container', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">[${TypeIds.Plain},"outer"]</script>
      <div ${QContainerAttr}="paused">
        <script type="qwik/state" q:base="0" q:len="1">[${TypeIds.Plain},"inner"]</script>
      </div>
    `);
    const inner = container.lastElementChild!;

    const outerContext = createContainerContext(container);
    const innerContext = createContainerContext(inner);

    expect(await outerContext.getRoot(0)).toBe('outer');
    expect(await innerContext.getRoot(0)).toBe('inner');
  });

  it('does not inflate a disposed streamed root', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1" q:dispose="0">
        [${TypeIds.EffectSubscription},[${TypeIds.Plain},${EffectKind.Content}]]
      </script>
    `);
    const context = createContainerContext(container);

    expect(await context.getRoot(0)).toMatchObject({ owner: null });
  });

  it('keeps a disposed streamed root out of an owner tree', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="2" q:dispose="1">
        [${TypeIds.Owner},[${TypeIds.Constant},${Constants.Null},${TypeIds.Plain},0,${TypeIds.Constant},${Constants.False}],
         ${TypeIds.EffectSubscription},[${TypeIds.Plain},${EffectKind.Content}]]
      </script>
    `);
    const context = createContainerContext(container);

    const owner = (await context.getRoot(0)) as { items: unknown };
    const disposed = (await context.getRoot(1)) as Subscriber;
    expect(owner.items).toBeNull();
    expect(disposed.flags & SubscriberFlags.Disposed).toBeTruthy();
    expect(disposed.owner).toBeNull();
  });

  it('attaches streamed subscribers lazily when a source first resumes', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="2">
        [${TypeIds.Signal},[${TypeIds.Plain},0],${TypeIds.Plain},null]
      </script>
      <script type="qwik/state" q:base="2" q:len="0" q:sub>[0,1]</script>
    `);
    const context = createContainerContext(container);

    const source = (await context.getRoot(0)) as Source<number>;

    expect(toArray(source.subs)).toHaveLength(1);
    expect(isLazySerialized(toArray(source.subs)[0])).toBe(true);
    expect(context.state.subscriberRoots).toBeUndefined();
  });

  it('catches up a streamed subscriber when its source changed before the packet', async () => {
    const serialization = createSerializationContext(
      null,
      () => '',
      () => {},
      new WeakMap()
    );
    const serverCount = useSignal(0);
    serialization.$addRoot$(serverCount);
    await serialization.$serialize$();
    const shellState = serialization.$writer$.toString();
    let serverSubscriber!: Subscriber;
    runWithOwner(createOwner(null), () => {
      renderSsrTextNode(4, null, serverCount);
      serverSubscriber = toArray(serverCount.subs)[0] as Subscriber;
    });
    const subscriberId = serialization.$addRoot$(serverSubscriber);
    const packetState = await serialization.$serializeNext$();
    expect(packetState).not.toBeNull();

    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">${shellState}</script>
      <span q:id="4">0</span>
    `);
    const scheduler = new Scheduler(() => {});
    const context = createContainerContext(container, scheduler);
    const count = (await context.getRoot(0)) as Signal<number>;
    count.value = 3;
    const shellNotify = vi.fn();
    appendSourceSubscriber(count, {
      kind: SubscriberKind.Dom,
      scheduler: { notify: shellNotify },
    } as unknown as Subscriber);
    const packet = appendStateScript(
      container,
      packetState!.base,
      JSON.parse(packetState!.state) as unknown[],
      packetState!.len
    );
    const metadata = appendSubscriptionScript(container, packetState!.base + packetState!.len, [
      0,
      subscriberId,
    ]);
    context.registerStateScripts!([packet, metadata]);
    await context.prepareRoot(subscriberId);

    expect(container.querySelector('span')?.textContent).toBe('3');
    expect(toArray(count.subs)).toHaveLength(2);
    expect(shellNotify).not.toHaveBeenCalled();

    count.value = 4;
    await scheduler.flushInteraction();
    expect(container.querySelector('span')?.textContent).toBe('4');
  });

  it('attaches active packet subscriptions without registering them twice', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">
        [${TypeIds.Signal},[${TypeIds.Plain},3]]
      </script>
    `);
    const context = createContainerContext(container);
    const metadata = appendSubscriptionScript(container, 1, [0, 1]);

    const source = (await context.getRoot(0)) as Source<number>;
    context.registerStateScripts!([metadata]);
    context.registerStateScripts!([metadata]);

    expect(source.v).toBe(3);
    expect(toArray(source.subs)).toHaveLength(1);
    expect(isLazySerialized(toArray(source.subs)[0])).toBe(true);
    expect(context.state.subscriberRoots).toBeUndefined();
  });

  it('preprocesses deep root refs from a streamed state batch', async () => {
    const container = createContainer('');
    const context = createContainerContext(container);
    const state = appendStateScript(
      container,
      0,
      [
        TypeIds.Object,
        [TypeIds.Plain, 'shared', TypeIds.Object, [TypeIds.Plain, 'value', TypeIds.Plain, 1]],
        TypeIds.RootRef,
        '0 1',
      ],
      2
    );

    context.registerStateScripts!([state]);

    const parent = (await context.getRoot(0)) as { shared: { value: number } };
    expect(await context.getRoot(1)).toBe(parent.shared);
  });

  it('keeps forward refs outside root ranges and replaces their cache', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">
        [${TypeIds.Array},[${TypeIds.ForwardRef},0]]
      </script>
      <script type="qwik/state" q:base="1" q:len="0" q:fr>
        [${TypeIds.ForwardRefs},[1]]
      </script>
      <script type="qwik/state" q:base="1" q:len="1">
        [${TypeIds.Plain},"first"]
      </script>
    `);
    const context = createContainerContext(container);

    expect(context.getForwardRefs()).toEqual([1]);
    const metadata = appendStateScript(container, 2, [TypeIds.ForwardRefs, [2]], 0, true);
    context.registerStateScripts!([metadata]);
    const state = appendStateScript(container, 2, [TypeIds.Plain, 'second']);
    context.registerStateScripts!([state]);

    expect(context.getForwardRefs()).toEqual([2]);
    expect(await context.getRoot(0)).toEqual(['second']);
  });

  it('restores forward refs from a separate state chunk', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">
        [${TypeIds.Array},[${TypeIds.ForwardRef},0]]
      </script>
      <script type="qwik/state" q:base="1" q:len="0" q:fr>
        [${TypeIds.ForwardRefs},[2]]
      </script>
      <script type="qwik/state" q:base="2" q:len="1">
        [${TypeIds.Plain},"value"]
      </script>
    `);
    const context = createContainerContext(container);

    expect(await context.getRoot(0)).toEqual(['value']);
  });

  it('restores context scopes from context markers by state root id', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="5" q:len="1">
        [${TypeIds.ContextScope},[${TypeIds.Constant},${Constants.Null},${TypeIds.Plain},"context",${TypeIds.Plain},"value"]]
      </script>
      <!c=5><button q-e:click="">Click</button><!/c>
    `);
    const context = createContainerContext(container);
    const button = container.querySelector('button')!;

    const scope = await getContextScopeForNode(context, button);

    expect(isContextScope(scope)).toBe(true);
    if (!isContextScope(scope)) {
      throw new Error('Expected a context scope.');
    }
    expect(scope.id).toBe('5');
    expect(scope.values.get('context')).toBe('value');
  });

  it('resolves deep root refs lazily after the parent root is restored', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="5" q:len="2">
        [${TypeIds.ContextScope},[${TypeIds.Constant},${Constants.Null},${TypeIds.Plain},"context",${TypeIds.Plain},"value"],${TypeIds.RootRef},"5 1"]
      </script>
    `);
    const context = createContainerContext(container);

    const scope = await context.getRoot(5);

    expect(isContextScope(scope)).toBe(true);
    expect(await context.getRoot(6)).toBe('context');
  });

  it('keeps lazily promoted deep root refs shared with parent roots', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="2">
        [${TypeIds.Object},[${TypeIds.Plain},"shared",${TypeIds.Object},[${TypeIds.Plain},"value",${TypeIds.Plain},1]],${TypeIds.RootRef},"0 1"]
      </script>
    `);
    const context = createContainerContext(container);

    const parent = (await context.getRoot(0)) as { shared: { value: number } };
    const shared = await context.getRoot(1);

    expect(parent.shared).toBe(shared);
    expect(parent.shared.value).toBe(1);
  });

  it('promotes deep root refs across state chunks', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">
        [${TypeIds.Object},[${TypeIds.Plain},"shared",${TypeIds.Object},[${TypeIds.Plain},"value",${TypeIds.Plain},1]]]
      </script>
      <script type="qwik/state" q:base="1024" q:len="1">
        [${TypeIds.RootRef},"0 1"]
      </script>
    `);
    const context = createContainerContext(container);

    const shared = await context.getRoot(1024);
    const parent = (await context.getRoot(0)) as { shared: { value: number } };

    expect(parent.shared).toBe(shared);
    expect(parent.shared.value).toBe(1);
  });

  it('restores root refs across state chunks', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">
        [${TypeIds.Object},[${TypeIds.Plain},"shared",${TypeIds.RootRef},1024]]
      </script>
      <script type="qwik/state" q:base="1024" q:len="1">
        [${TypeIds.Object},[${TypeIds.Plain},"value",${TypeIds.Plain},1]]
      </script>
    `);
    const context = createContainerContext(container);

    const parent = (await context.getRoot(0)) as { shared: { value: number } };
    const shared = await context.getRoot(1024);

    expect(parent.shared).toBe(shared);
    expect(parent.shared.value).toBe(1);
  });

  it('promotes deep root refs through intermediate root refs', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">
        [${TypeIds.Object},[${TypeIds.Plain},"shared",${TypeIds.RootRef},62465]]
      </script>
      <script type="qwik/state" q:base="1024" q:len="1">
        [${TypeIds.RootRef},"0 1 1"]
      </script>
      <script type="qwik/state" q:base="62465" q:len="1">
        [${TypeIds.Object},[${TypeIds.Plain},"nested",${TypeIds.Object},[${TypeIds.Plain},"value",${TypeIds.Plain},1]]]
      </script>
    `);
    const context = createContainerContext(container);

    const nested = await context.getRoot(1024);
    const parent = (await context.getRoot(62465)) as { nested: { value: number } };

    expect(parent.nested).toBe(nested);
    expect(parent.nested.value).toBe(1);
  });

  it('promotes deep root refs through intermediate deep root refs', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">
        [${TypeIds.Object},[${TypeIds.Plain},"shared",${TypeIds.RootRef},"18 0 1"]]
      </script>
      <script type="qwik/state" q:base="18" q:len="1">
        [${TypeIds.Array},[${TypeIds.Array},[${TypeIds.Plain},"skip",${TypeIds.Object},[${TypeIds.Plain},"value",${TypeIds.Plain},1]]]]
      </script>
      <script type="qwik/state" q:base="1024" q:len="1">
        [${TypeIds.RootRef},"0 1"]
      </script>
    `);
    const context = createContainerContext(container);

    const shared = await context.getRoot(1024);
    const parent = (await context.getRoot(0)) as { shared: { value: number } };

    expect(parent.shared).toBe(shared);
    expect(parent.shared.value).toBe(1);
  });

  it('keeps lazy deep root refs idempotent when the promoted root is restored first', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="2">
        [${TypeIds.Object},[${TypeIds.Plain},"shared",${TypeIds.Object},[${TypeIds.Plain},"value",${TypeIds.Plain},1]],${TypeIds.RootRef},"0 1"]
      </script>
    `);
    const context = createContainerContext(container);

    const shared = await context.getRoot(1);
    const parent = (await context.getRoot(0)) as { shared: { value: number } };

    expect(parent.shared).toBe(shared);
    expect(parent.shared.value).toBe(1);
  });
});

function createContainer(html: string): Element {
  const document = createDocument({
    html: `<div ${QContainerAttr}="paused">${html}</div>`,
  });
  const container = document.body.firstElementChild;
  if (container === null) {
    throw new Error('Missing test container.');
  }
  return container;
}

function appendStateScript(
  container: Element,
  base: number,
  state: unknown[],
  len = 1,
  forwardRefs = false
): HTMLScriptElement {
  const script = container.ownerDocument.createElement('script');
  script.setAttribute('type', 'qwik/state');
  script.setAttribute('q:base', String(base));
  script.setAttribute('q:len', String(len));
  if (forwardRefs) {
    script.setAttribute('q:fr', '');
  }
  script.textContent = JSON.stringify(state);
  container.appendChild(script);
  return script;
}

function appendSubscriptionScript(
  container: Element,
  base: number,
  subscriptions: readonly number[]
): HTMLScriptElement {
  const script = appendStateScript(container, base, [...subscriptions], 0);
  script.setAttribute('q:sub', '');
  return script;
}

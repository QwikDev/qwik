import { describe, expect, it } from 'vitest';
import { createDocument } from '../../testing/document';
import { Constants, TypeIds } from '../shared/serdes/constants';
import { QContainerAttr } from '../shared/utils/markers';
import { createContainerContext, getContextScopeForNode } from './container-context';
import { isContextScope } from './context-scope';
import { EffectKind } from '../dom/effect/effect-kind.enum';
import { isLazySerialized } from '../reactive/lazy-serialized';
import type { Source } from '../reactive/source';
import { createSerializationContext } from '../shared/serdes/serialization-context';
import { useSignal } from '../reactive/public-api';
import { createOwner, runWithOwner } from './owner';
import { createSsrElementTextTarget, renderSsrTextNode } from '../dom/effect/ssr-effect';
import type { Subscriber } from './subscriber';
import { Scheduler } from './scheduler';
import type { Signal } from '../reactive/signal';

describe('ContainerContext', () => {
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

  it('attaches streamed subscribers lazily when a source first resumes', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="2">
        [${TypeIds.Signal},[${TypeIds.Plain},0],${TypeIds.Plain},null]
      </script>
      <script type="qwik/state" q:base="2" q:len="0" q:sub>[0,1]</script>
    `);
    const context = createContainerContext(container);

    const source = (await context.getRoot(0)) as Source<number>;

    expect(source.subs).toHaveLength(1);
    expect(isLazySerialized(source.subs?.[0])).toBe(true);
    expect(context.state.subscriberRoots).toBeUndefined();
  });

  it('runs a streamed subscriber on the first source update after resume', async () => {
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
      renderSsrTextNode(createSsrElementTextTarget(4), serverCount);
      serverSubscriber = serverCount.subs![0] as Subscriber;
    });
    const subscriberId = serialization.$addRoot$(serverSubscriber);
    const packetState = await serialization.$serializeNext$();
    expect(packetState).not.toBeNull();

    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">${shellState}</script>
      <span q:id="4">0</span>
      <script type="qwik/state" q:base="${packetState!.base}" q:len="${packetState!.len}">${packetState!.state}</script>
      <script type="qwik/state" q:base="${packetState!.base + packetState!.len}" q:len="0" q:sub>[0,${subscriberId}]</script>
    `);
    const scheduler = new Scheduler(() => {});
    const context = createContainerContext(container, scheduler);
    const count = (await context.getRoot(0)) as Signal<number>;

    count.value = 3;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await scheduler.flushInteraction();

    expect(container.querySelector('span')?.textContent).toBe('3');
    expect(count.subs).toHaveLength(1);
  });

  it('leaves active packet subscriptions to root preparation', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">
        [${TypeIds.Signal},[${TypeIds.Plain},3]]
      </script>
    `);
    const context = createContainerContext(container);
    const metadata = appendSubscriptionScript(container, 1, [0, 1]);

    context.registerStateScripts!([metadata]);
    const source = (await context.getRoot(0)) as Source<number>;

    expect(source.v).toBe(3);
    expect(source.subs).toBeNull();
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

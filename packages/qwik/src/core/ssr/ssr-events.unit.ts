import { describe, expect, it } from 'vitest';
import { _val } from '../shared/jsx/bind-handlers';
import { runQrl, taskQrl, valQrl } from '../shared/qrl/handler-qrls';
import { inlinedQrl } from '../shared/qrl/qrl';
import { createQRL, type QRLInternal } from '../shared/qrl/qrl-class';
import type { SerializationContext } from '../../serializer/serialization-context';
import type { QRL } from '../shared/qrl/qrl.public';
import type { Container } from '../shared/types';
import { invoke, newInvokeContext } from '../use/use-core';
import { modulepreload as _modulepreload, setEvent } from './ssr-events';

describe('setEvent', () => {
  const context = {
    $symbolToChunkResolver$: () => 'runtime',
    $addRoot$: () => 0,
    $eventQrls$: new Set(),
    $eventNames$: new Set(),
    $coreHandlerQrls$: new Map(),
  } as unknown as SerializationContext;

  it('does not wrap a capture-free sibling of moved captures', () => {
    const qrl = createQRL('chunk', 'handler', () => {});

    expect(setEvent(context, 'q-d:qinit', qrl, true)).toBe('chunk#handler');
  });

  it('lists the handler chunk after the core chunk that runs it', () => {
    const qrl = createQRL('chunk', 'handler', () => {}).m();

    expect(setEvent(context, 'q-e:click', qrl, true)).toEqual([
      `runtime#${runQrl().$symbol$}`,
      '#',
      0,
      '#chunk',
    ]);
  });

  it('lists only the core chunk when the handler has no chunk file of its own', () => {
    const qrl = createQRL('_', 'handler', () => {}).m();

    expect(setEvent(context, 'q-e:click', qrl, true)).toEqual([
      `runtime#${runQrl().$symbol$}`,
      '#',
      0,
    ]);
  });

  const symbols = (qrls: Iterable<QRL<unknown>>) => [...qrls].map((q) => q.getSymbol());

  it('tells the preloader about _run and the handler it runs, in that order', () => {
    const qrl = createQRL('chunk', 'handler', () => {}).m();
    context.$eventQrls$.clear();

    setEvent(context, 'q-e:click', qrl, true);

    expect(symbols(context.$eventQrls$)).toEqual([runQrl().$symbol$, 'handler']);
  });

  describe("remembers each of core's handlers the page's events run through", () => {
    const freshContext = () =>
      ({
        $symbolToChunkResolver$: () => 'runtime',
        $addRoot$: () => 0,
        $eventQrls$: new Set(),
        $eventNames$: new Set(),
        $coreHandlerQrls$: new Map(),
      }) as unknown as SerializationContext;
    const rememberedHashes = (ctx: SerializationContext) => [...ctx.$coreHandlerQrls$.keys()];

    it('_run, for a handler with captures', () => {
      const ctx = freshContext();

      setEvent(ctx, 'q-e:click', createQRL('chunk', 'handler', () => {}).m(), true);

      expect(rememberedHashes(ctx)).toEqual([runQrl().getHash()]);
    });

    it("_task, when the page's only handler is a visible task", () => {
      const ctx = freshContext();

      setEvent(ctx, 'q-e:qvisible', taskQrl().w([{}]), false);

      expect(rememberedHashes(ctx)).toEqual([taskQrl().getHash()]);
    });

    it('none, for a handler without captures', () => {
      const ctx = freshContext();

      setEvent(
        ctx,
        'q-e:click',
        createQRL('chunk', 'handler', () => {}),
        true
      );

      expect(rememberedHashes(ctx)).toEqual([]);
    });

    it('each one once, in the order they appear', () => {
      const ctx = freshContext();

      setEvent(ctx, 'q-e:qvisible', taskQrl().w([{}]), false);
      setEvent(ctx, 'q-e:click', createQRL('chunk', 'handler', () => {}).m(), true);
      setEvent(ctx, 'q-e:qvisible', taskQrl().w([{}]), false);

      expect(rememberedHashes(ctx)).toEqual([taskQrl().getHash(), runQrl().getHash()]);
    });
  });

  it("preloads the optimizer's bind:value handler from core's own handler bundle", () => {
    const qrl = inlinedQrl(_val, '_val', [{}]) as QRLInternal<unknown>;
    context.$eventQrls$.clear();

    setEvent(context, 'q-e:input', qrl, false);

    expect(symbols(context.$eventQrls$)).toEqual([valQrl().$symbol$]);
  });

  it("serializes the optimizer's bind:value handler as core's own handler", () => {
    const qrl = inlinedQrl(_val, '_val', [{}]) as QRLInternal<unknown>;

    expect(setEvent(context, 'q-e:input', qrl, false)).toEqual([
      `runtime#${valQrl().$symbol$}`,
      '#',
      0,
    ]);
  });
});

describe('_modulepreload', () => {
  const symbols = (qrls: QRL<unknown>[]) => qrls.map((q) => q.getSymbol());
  const createGotoQrl = () => createQRL('goto.js', 's_goto', () => {});

  const duringServerRender = (render: () => void) => {
    const serializationCtx = { $modulepreloads$: new Map() } as unknown as SerializationContext;
    const context = newInvokeContext();
    context.$container$ = { serializationCtx } as unknown as Container;
    invoke(context, render);
    return [...serializationCtx.$modulepreloads$.values()];
  };

  it("remembers QRLs and bundle graph names during a server render: _modulepreload(gotoQrl, '@qwik-router-config') keeps both", () => {
    const gotoQrl = createGotoQrl();

    const kept = duringServerRender(() => _modulepreload(gotoQrl, '@qwik-router-config'));

    expect(kept).toEqual([gotoQrl, '@qwik-router-config']);
  });

  it('remembers a QRL once: two <Link>s call _modulepreload(gotoQrl), the page keeps one gotoQrl', () => {
    const kept = duringServerRender(() => {
      _modulepreload(createGotoQrl());
      _modulepreload(createGotoQrl());
    });

    expect(symbols(kept as QRL<unknown>[])).toEqual(['s_goto']);
  });

  it('does nothing on the client: _modulepreload(gotoQrl) in a client render keeps nothing', () => {
    const clientRender = newInvokeContext();
    clientRender.$container$ = {} as unknown as Container;

    expect(() => invoke(clientRender, () => _modulepreload(createGotoQrl()))).not.toThrow();
    expect(() => _modulepreload(createGotoQrl())).not.toThrow();
  });

  it('ignores a missing value: _modulepreload(undefined) keeps nothing', () => {
    expect(duringServerRender(() => _modulepreload(undefined))).toEqual([]);
  });
});

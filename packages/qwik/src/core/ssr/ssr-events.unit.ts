import { describe, expect, it } from 'vitest';
import { _val } from '../shared/jsx/bind-handlers';
import { runQrl, taskQrl, valQrl } from '../shared/qrl/handler-qrls';
import { inlinedQrl } from '../shared/qrl/qrl';
import { createQRL, type QRLInternal } from '../shared/qrl/qrl-class';
import type { SerializationContext } from '../../serializer/serialization-context';
import type { QRL } from '../shared/qrl/qrl.public';
import { setEvent } from './ssr-events';

describe('setEvent', () => {
  const context = {
    $symbolToChunkResolver$: () => 'runtime',
    $addRoot$: () => 0,
    $eventQrls$: new Set(),
    $eventNames$: new Set(),
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

  describe("remembers the first of core's handlers the page's events run through", () => {
    const freshContext = () =>
      ({
        $symbolToChunkResolver$: () => 'runtime',
        $addRoot$: () => 0,
        $eventQrls$: new Set(),
        $eventNames$: new Set(),
        $coreHandlerQrl$: null,
      }) as unknown as SerializationContext;

    it('_run, for a handler with captures', () => {
      const ctx = freshContext();

      setEvent(ctx, 'q-e:click', createQRL('chunk', 'handler', () => {}).m(), true);

      expect(ctx.$coreHandlerQrl$).toBe(runQrl());
    });

    it("_task, when the page's only handler is a visible task", () => {
      const ctx = freshContext();

      setEvent(ctx, 'q-e:qvisible', taskQrl().w([{}]), false);

      expect(ctx.$coreHandlerQrl$?.getHash()).toBe(taskQrl().getHash());
    });

    it('none, for a handler without captures', () => {
      const ctx = freshContext();

      setEvent(
        ctx,
        'q-e:click',
        createQRL('chunk', 'handler', () => {}),
        true
      );

      expect(ctx.$coreHandlerQrl$).toBe(null);
    });

    it('the first one only', () => {
      const ctx = freshContext();

      setEvent(ctx, 'q-e:qvisible', taskQrl().w([{}]), false);
      setEvent(ctx, 'q-e:click', createQRL('chunk', 'handler', () => {}).m(), true);

      expect(ctx.$coreHandlerQrl$?.getHash()).toBe(taskQrl().getHash());
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

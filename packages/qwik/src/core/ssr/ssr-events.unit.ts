import { describe, expect, it } from 'vitest';
import { _val } from '../shared/jsx/bind-handlers';
import { runQrl, valQrl } from '../shared/qrl/handler-qrls';
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
    $eventHandlerQrls$: [],
    $eventNames$: new Set(),
  } as unknown as SerializationContext;

  it('does not wrap a capture-free sibling of moved captures', () => {
    const qrl = createQRL('chunk', 'handler', () => {});

    expect(setEvent(context, 'q-d:qinit', qrl, true)).toBe('chunk#handler');
  });

  it('wraps a handler that receives moved captures', () => {
    const qrl = createQRL('chunk', 'handler', () => {}).m();

    expect(setEvent(context, 'q-e:click', qrl, true)).toEqual([
      `runtime#${runQrl().$symbol$}`,
      '#',
      0,
    ]);
  });

  it('records the QRL the attribute references, for SSR to preload its bundle', () => {
    const qrl = createQRL('chunk', 'handler', () => {}).m();
    context.$eventHandlerQrls$.length = 0;

    setEvent(context, 'q-e:click', qrl, true);

    expect(context.$eventHandlerQrls$.map((handler) => handler.getSymbol())).toEqual([
      runQrl().$symbol$,
    ]);
  });

  it("preloads the optimizer's bind:value handler from core's own handler bundle", () => {
    const qrl = inlinedQrl(_val, '_val', [{}]) as QRLInternal<unknown>;
    context.$eventHandlerQrls$.length = 0;
    context.$eventQrls$.clear();

    setEvent(context, 'q-e:input', qrl, false);

    const symbols = (qrls: Iterable<QRL<unknown>>) => [...qrls].map((q) => q.getSymbol());
    expect(symbols(context.$eventHandlerQrls$)).toEqual([valQrl().$symbol$]);
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
